package app.gunther

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object Disk {
    private const val TAG = "GuntherDisk"
    private const val PREFS = "gunther_disk"
    private const val TREE = "tree_uri"

    fun workspaceDir(context: Context): File = File(context.filesDir, "workspace")

    fun saveTree(context: Context, uri: Uri) {
        try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        } catch (err: Exception) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            } catch (_: Exception) {
            }
            Log.w(TAG, "write persistable permission failed: ${err.message}")
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TREE, uri.toString())
            .commit()
    }

    fun treeUri(context: Context): Uri? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TREE, null)
        return raw?.let { Uri.parse(it) }
    }

    fun materialize(context: Context, files: JSONObject) {
        val root = workspaceDir(context)
        if (root.exists()) root.deleteRecursively()
        root.mkdirs()
        val keys = files.keys()
        while (keys.hasNext()) {
            val path = keys.next()
            val text = files.optString(path)
            val dest = File(root, path)
            dest.parentFile?.mkdirs()
            dest.writeText(text)
        }
    }

    fun writeFile(context: Context, path: String, content: String): JSONObject {
        val rel = sanitize(path) ?: return fail("Bad path")
        val dest = File(workspaceDir(context), rel)
        dest.parentFile?.mkdirs()
        dest.writeText(content)
        val saf = writeSaf(context, rel, content)
        return JSONObject()
            .put("ok", true)
            .put("disk", dest.absolutePath)
            .put("folder", saf)
    }

    fun deleteFile(context: Context, path: String): JSONObject {
        val rel = sanitize(path) ?: return fail("Bad path")
        File(workspaceDir(context), rel).delete()
        deleteSaf(context, rel)
        return JSONObject().put("ok", true)
    }

    fun runShell(context: Context, command: String): JSONObject {
        val cwd = workspaceDir(context)
        if (!cwd.exists()) {
            return fail("No folder on disk. Import a project folder first.")
        }
        val trimmed = command.trim()
        if (trimmed.isEmpty()) return fail("Empty command")
        if (blocked(trimmed)) return fail("Command blocked")
        return try {
            val process = ProcessBuilder("sh", "-c", trimmed)
                .directory(cwd)
                .redirectErrorStream(true)
                .start()
            val finished = process.waitFor(15, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                return fail("Timed out after 15s")
            }
            val out = process.inputStream.readBytes().toString(Charsets.UTF_8).take(16_384)
            JSONObject()
                .put("ok", true)
                .put("exit", process.exitValue())
                .put("output", out)
        } catch (err: Exception) {
            fail(err.message ?: "Shell failed")
        }
    }

    fun searchWeb(query: String): JSONObject {
        val q = query.trim()
        if (q.isEmpty()) return fail("Empty query")
        val hits = JSONArray()
        wiki(q, hits)
        duck(q, hits)
        return JSONObject().put("ok", true).put("hits", hits)
    }

    fun verify(context: Context): JSONObject {
        val cwd = workspaceDir(context)
        val issues = JSONArray()
        var checked = 0
        if (!cwd.exists()) {
            return JSONObject()
                .put("ok", true)
                .put("passed", false)
                .put("issues", JSONArray().put("No folder on disk. Import a project first."))
        }
        cwd.walkTopDown().forEach { file ->
            if (!file.isFile) return@forEach
            val rel = file.relativeTo(cwd).path.replace('\\', '/')
            val name = file.name.lowercase()
            checked += 1
            if (name.endsWith(".json")) {
                try {
                    JSONObject(file.readText())
                } catch (_: Exception) {
                    try {
                        JSONArray(file.readText())
                    } catch (err: Exception) {
                        issues.put("$rel: invalid JSON (${err.message})")
                    }
                }
            }
        }
        val py = which("python3") ?: which("python")
        if (py != null) {
            val pyFiles = cwd.walkTopDown().filter { it.isFile && it.name.endsWith(".py") }.toList()
            for (file in pyFiles.take(40)) {
                val rel = file.relativeTo(cwd).path
                val result = runIn(cwd, "$py -m py_compile ${shellEscape(rel)}")
                if (result.exit != 0) issues.put("$rel: python compile failed\n${result.output}")
            }
        } else {
            issues.put("note: python is not on this phone — .py files were not compiled")
        }
        val node = which("node")
        if (node != null) {
            val js = cwd.walkTopDown().filter {
                it.isFile && (it.name.endsWith(".js") || it.name.endsWith(".mjs"))
            }.toList()
            for (file in js.take(40)) {
                val rel = file.relativeTo(cwd).path
                val result = runIn(cwd, "$node --check ${shellEscape(rel)}")
                if (result.exit != 0) issues.put("$rel: node --check failed\n${result.output}")
            }
        }
        val pkg = File(cwd, "package.json")
        if (pkg.exists() && which("npm") != null) {
            val result = runIn(cwd, "npm test --silent")
            if (result.exit != 0) issues.put("npm test failed (exit ${result.exit})\n${result.output.take(2000)}")
        }
        val realIssues = JSONArray()
        for (i in 0 until issues.length()) {
            val item = issues.optString(i)
            if (!item.startsWith("note:")) realIssues.put(item)
        }
        return JSONObject()
            .put("ok", true)
            .put("passed", realIssues.length() == 0)
            .put("checked", checked)
            .put("issues", issues)
    }

    private data class Shell(val exit: Int, val output: String)

    private fun runIn(cwd: File, command: String): Shell {
        return try {
            val process = ProcessBuilder("sh", "-c", command)
                .directory(cwd)
                .redirectErrorStream(true)
                .start()
            val finished = process.waitFor(20, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                Shell(124, "timeout")
            } else {
                Shell(process.exitValue(), process.inputStream.readBytes().toString(Charsets.UTF_8).take(4000))
            }
        } catch (err: Exception) {
            Shell(1, err.message ?: "failed")
        }
    }

    private fun which(bin: String): String? {
        return try {
            val process = ProcessBuilder("sh", "-c", "command -v $bin").start()
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                return null
            }
            if (process.exitValue() != 0) return null
            process.inputStream.readBytes().toString(Charsets.UTF_8).trim().ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun wiki(query: String, hits: JSONArray) {
        try {
            val url =
                "https://en.wikipedia.org/w/api.php?action=opensearch&limit=4&namespace=0&format=json&search=" +
                    URLEncoder.encode(query, "UTF-8")
            val body = httpGet(url) ?: return
            val arr = JSONArray(body)
            val titles = arr.optJSONArray(1) ?: return
            val descs = arr.optJSONArray(2) ?: JSONArray()
            val urls = arr.optJSONArray(3) ?: JSONArray()
            for (i in 0 until titles.length()) {
                hits.put(
                    JSONObject()
                        .put("title", titles.optString(i))
                        .put("excerpt", descs.optString(i))
                        .put("url", urls.optString(i)),
                )
            }
        } catch (err: Exception) {
            Log.w(TAG, "wiki: ${err.message}")
        }
    }

    private fun duck(query: String, hits: JSONArray) {
        try {
            val url =
                "https://api.duckduckgo.com/?format=json&no_html=1&no_redirect=1&q=" +
                    URLEncoder.encode(query, "UTF-8")
            val body = httpGet(url) ?: return
            val obj = JSONObject(body)
            val abstract = obj.optString("AbstractText")
            val absUrl = obj.optString("AbstractURL")
            if (abstract.isNotBlank()) {
                hits.put(
                    JSONObject()
                        .put("title", obj.optString("Heading").ifBlank { query })
                        .put("excerpt", abstract.take(400))
                        .put("url", absUrl),
                )
            }
            val related = obj.optJSONArray("RelatedTopics") ?: return
            var n = 0
            for (i in 0 until related.length()) {
                if (n >= 4) break
                val item = related.optJSONObject(i) ?: continue
                val text = item.optString("Text")
                val href = item.optString("FirstURL")
                if (text.isBlank() || href.isBlank()) continue
                hits.put(JSONObject().put("title", text.take(80)).put("excerpt", text).put("url", href))
                n += 1
            }
        } catch (err: Exception) {
            Log.w(TAG, "ddg: ${err.message}")
        }
    }

    private fun httpGet(spec: String): String? {
        val conn = (URL(spec).openConnection() as HttpURLConnection)
        conn.instanceFollowRedirects = true
        conn.connectTimeout = 12000
        conn.readTimeout = 15000
        conn.setRequestProperty("User-Agent", "Gunther/1.8 (research; +https://github.com/thepotatoninjahost/Gunther)")
        conn.setRequestProperty("Accept", "application/json")
        return try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            stream?.bufferedReader(Charsets.UTF_8)?.readText()
        } finally {
            conn.disconnect()
        }
    }

    private fun writeSaf(context: Context, rel: String, content: String): Boolean {
        val tree = treeUri(context) ?: return false
        val root = DocumentFile.fromTreeUri(context, tree) ?: return false
        val parts = rel.split('/').filter { it.isNotEmpty() && it != "." && it != ".." }
        if (parts.isEmpty()) return false
        var dir = root
        for (i in 0 until parts.lastIndex) {
            val name = parts[i]
            val next = dir.findFile(name) ?: dir.createDirectory(name) ?: return false
            if (!next.isDirectory) return false
            dir = next
        }
        val name = parts.last()
        var file = dir.findFile(name)
        if (file == null || !file.isFile) {
            file = dir.createFile("application/octet-stream", name) ?: return false
        }
        return try {
            context.contentResolver.openOutputStream(file.uri, "wt")?.use { out ->
                out.write(content.toByteArray(Charsets.UTF_8))
            } != null
        } catch (err: Exception) {
            Log.w(TAG, "saf write $rel: ${err.message}")
            false
        }
    }

    private fun deleteSaf(context: Context, rel: String) {
        val tree = treeUri(context) ?: return
        val root = DocumentFile.fromTreeUri(context, tree) ?: return
        val parts = rel.split('/').filter { it.isNotEmpty() }
        var node: DocumentFile = root
        for (part in parts) {
            node = node.findFile(part) ?: return
        }
        node.delete()
    }

    private fun sanitize(path: String): String? {
        val rel = path.trim().trimStart('/').replace('\\', '/')
        if (rel.isEmpty() || rel.contains("..") || rel.startsWith("/")) return null
        return rel
    }

    private fun blocked(command: String): Boolean {
        val lower = command.lowercase()
        val banned = listOf(
            "rm -rf /", "reboot", "mkfs", "dd if=", "su ", ":(){",
            "am start", "pm uninstall", "settings put",
        )
        return banned.any { lower.contains(it) }
    }

    private fun shellEscape(path: String): String = "'" + path.replace("'", "'\\''") + "'"

    private fun fail(message: String) = JSONObject().put("ok", false).put("error", message)
}
