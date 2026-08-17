package com.codingagent.core.workspace

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * One project's isolated workspace.
 *
 * Contains:
 * - Root directory for project files (agent tools may only touch files under this root)
 * - Conversation history for this project
 * - Optional system-prompt override that layers on top of the base runtime prompt
 * - Project notes / prior decisions (injected into SESSION CONTEXT)
 * - Session-scoped log of files touched (injected into SESSION CONTEXT)
 *
 * The agent runtime must never allow tools to escape [rootDir].
 */
class ProjectWorkspace(
    val projectId: String,
    val displayName: String,
    val rootDir: File,
    val history: ConversationHistory,
    var systemPromptOverride: String? = null,
    /** Free-form notes and prior decisions the agent should respect. */
    var projectNotes: String = "",
    /** Relative paths touched during the current app session (not persisted across process death by default). */
    private val sessionFilesTouched: MutableSet<String> = linkedSetOf()
) {
    init {
        if (!rootDir.exists()) {
            rootDir.mkdirs()
        }
        loadNotesFromDisk()
    }

    fun resolve(relativePath: String): File {
        val candidate = File(rootDir, relativePath).canonicalFile
        require(candidate.path.startsWith(rootDir.canonicalPath)) {
            "Path escapes workspace: $relativePath"
        }
        return candidate
    }

    fun listFilesRecursive(maxDepth: Int = 8): List<String> {
        val results = mutableListOf<String>()
        fun walk(dir: File, depth: Int, prefix: String) {
            if (depth > maxDepth) return
            dir.listFiles()?.sortedBy { it.name }?.forEach { f ->
                val rel = if (prefix.isEmpty()) f.name else "$prefix/${f.name}"
                if (f.isDirectory) {
                    results.add("$rel/")
                    walk(f, depth + 1, rel)
                } else {
                    results.add(rel)
                }
            }
        }
        walk(rootDir, 0, "")
        return results
    }

    /**
     * Best-effort module / package summary for SESSION CONTEXT.
     * For an Android project this surfaces top-level packages and source roots;
     * for empty workspaces it returns a clear placeholder.
     */
    fun moduleListSummary(): String {
        val files = listFilesRecursive(maxDepth = 4)
            .filter { !it.startsWith(".") && !it.endsWith("/") }
        if (files.isEmpty()) return "(empty workspace — no modules indexed yet)"

        val packages = files
            .filter { it.endsWith(".kt") || it.endsWith(".java") }
            .mapNotNull { path ->
                val parts = path.split('/')
                if (parts.size >= 2) parts.dropLast(1).joinToString(".") else null
            }
            .distinct()
            .sorted()
            .take(24)

        val other = files
            .filterNot { it.endsWith(".kt") || it.endsWith(".java") }
            .take(12)

        return buildString {
            if (packages.isNotEmpty()) {
                append("Packages/dirs: ")
                append(packages.joinToString(", "))
            }
            if (other.isNotEmpty()) {
                if (isNotEmpty()) append(" | ")
                append("Other: ")
                append(other.joinToString(", "))
            }
            if (isEmpty()) append(files.take(20).joinToString(", "))
        }
    }

    fun recordFileTouched(relativePath: String) {
        sessionFilesTouched.add(relativePath)
    }

    fun sessionFileLog(): String {
        return if (sessionFilesTouched.isEmpty()) {
            "(none this session)"
        } else {
            sessionFilesTouched.joinToString(", ")
        }
    }

    fun filesTouchedList(): List<String> = sessionFilesTouched.toList()

    fun saveNotesToDisk() {
        val notesFile = File(rootDir, ".project_notes.txt")
        notesFile.writeText(projectNotes)
    }

    private fun loadNotesFromDisk() {
        val notesFile = File(rootDir, ".project_notes.txt")
        if (notesFile.isFile) {
            projectNotes = notesFile.readText()
        }
    }
}

/**
 * Creates and opens project workspaces under the app's private files dir.
 */
class ProjectManager(
    private val context: Context,
    private val historyStore: ConversationHistoryStore
) {
    private val projectsRoot: File =
        File(context.filesDir, "projects").also { it.mkdirs() }

    private val openWorkspaces = mutableMapOf<String, ProjectWorkspace>()

    fun createProject(displayName: String): ProjectWorkspace {
        val id = UUID.randomUUID().toString()
        val dir = File(projectsRoot, id)
        dir.mkdirs()
        File(dir, ".project.json").writeText(
            JSONObject()
                .put("id", id)
                .put("displayName", displayName)
                .toString()
        )
        val history = historyStore.loadOrCreate(id)
        val ws = ProjectWorkspace(id, displayName, dir, history)
        openWorkspaces[id] = ws
        return ws
    }

    fun openProject(projectId: String): ProjectWorkspace? {
        openWorkspaces[projectId]?.let { return it }
        val dir = File(projectsRoot, projectId)
        if (!dir.isDirectory) return null
        val manifest = File(dir, ".project.json")
        val displayName = if (manifest.exists()) {
            try {
                JSONObject(manifest.readText()).optString("displayName", projectId)
            } catch (_: Exception) {
                projectId
            }
        } else {
            projectId
        }
        val history = historyStore.loadOrCreate(projectId)
        val ws = ProjectWorkspace(projectId, displayName, dir, history)
        openWorkspaces[projectId] = ws
        return ws
    }

    fun listProjects(): List<Pair<String, String>> {
        return projectsRoot.listFiles()
            ?.filter { it.isDirectory }
            ?.map { dir ->
                val id = dir.name
                val name = try {
                    val m = File(dir, ".project.json")
                    if (m.exists()) {
                        JSONObject(m.readText()).optString("displayName", id)
                    } else id
                } catch (_: Exception) {
                    id
                }
                id to name
            }
            ?.sortedBy { it.second.lowercase() }
            ?: emptyList()
    }

    fun closeProject(projectId: String) {
        openWorkspaces.remove(projectId)?.let { ws ->
            historyStore.save(projectId, ws.history)
            ws.saveNotesToDisk()
        }
    }

    fun saveAll() {
        openWorkspaces.forEach { (id, ws) ->
            historyStore.save(id, ws.history)
            ws.saveNotesToDisk()
        }
    }
}
