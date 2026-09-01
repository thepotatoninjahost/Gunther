package app.gunther

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import org.json.JSONObject

object ProjectImport {
    private val skipDirs = setOf(
        "node_modules", ".git", "dist", "build", ".next", ".gradle",
        "__pycache__", ".venv", "venv", ".idea", ".vscode",
    )
    private val skipExt = setOf(
        "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "pdf",
        "zip", "jar", "apk", "so", "class", "mp3", "mp4", "mov",
        "ogg", "wav", "woff", "woff2", "ttf", "eot", "exe", "dll",
    )
    private const val maxFile = 1_000_000
    private const val maxFiles = 150
    private const val maxTotal = 1_500_000

    fun fromTree(context: Context, tree: Uri): Pair<String, JSONObject> {
        val root = DocumentFile.fromTreeUri(context, tree) ?: return "folder" to JSONObject()
        val files = JSONObject()
        collect(context, root, "", files, intArrayOf(0))
        val name = root.name?.ifBlank { "imported" } ?: "imported"
        return name to files
    }

    fun fromUris(context: Context, uris: List<Uri>): JSONObject {
        val files = JSONObject()
        var total = 0
        for (uri in uris) {
            if (files.length() >= maxFiles || total >= maxTotal) break
            val doc = DocumentFile.fromSingleUri(context, uri)
            val name = doc?.name ?: uri.lastPathSegment?.substringAfterLast('/') ?: continue
            val ext = name.substringAfterLast('.', "").lowercase()
            if (ext in skipExt) continue
            if (doc != null && doc.length() > maxFile) continue
            val text = readText(context, uri) ?: continue
            files.put(name, text)
            total += text.length
        }
        return files
    }

    private fun collect(
        context: Context,
        dir: DocumentFile,
        prefix: String,
        out: JSONObject,
        total: IntArray,
    ) {
        if (out.length() >= maxFiles || total[0] >= maxTotal) return
        for (child in dir.listFiles()) {
            if (out.length() >= maxFiles || total[0] >= maxTotal) return
            val name = child.name ?: continue
            if (name.startsWith(".")) continue
            if (child.isDirectory) {
                if (name in skipDirs) continue
                val next = if (prefix.isEmpty()) name else "$prefix/$name"
                collect(context, child, next, out, total)
            } else {
                val ext = name.substringAfterLast('.', "").lowercase()
                if (ext in skipExt) continue
                if (child.length() > maxFile) continue
                val text = readText(context, child.uri) ?: continue
                val path = if (prefix.isEmpty()) name else "$prefix/$name"
                out.put(path, text)
                total[0] += text.length
            }
        }
    }

    private fun readText(context: Context, uri: Uri): String? {
        return try {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            if (bytes.any { it == 0.toByte() }) return null
            String(bytes, Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }
}
