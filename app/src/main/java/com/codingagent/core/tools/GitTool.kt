package com.codingagent.core.tools

import com.codingagent.core.workspace.ProjectWorkspace
import org.json.JSONObject
import java.io.File

/**
 * Lightweight git status / diff awareness.
 *
 * Requires that the workspace root is (or contains) a git repository.
 * Uses the system `git` binary via ProcessBuilder. If git is unavailable
 * or the directory is not a repo, returns a clear error instead of fabricating
 * output.
 *
 * This is intentionally read-only for the base agent; write operations
 * (commit, push) can be added later behind explicit user confirmation.
 */
class GitTool(
    private val workspaceProvider: () -> ProjectWorkspace?
) : AgentTool {

    override val name: String = "git"

    override val description: String =
        "Read-only git status or diff for the current project workspace. " +
        "Actions: status, diff. Optional path for diff."

    override val parametersSchemaJson: String = """
        {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["status", "diff"] },
            "path": { "type": "string", "description": "Optional path for diff" }
          },
          "required": ["action"]
        }
    """.trimIndent()

    override suspend fun invoke(argumentsJson: String): ToolResult {
        val ws = workspaceProvider()
            ?: return ToolResult(false, "", "No active project workspace")
        return try {
            val args = JSONObject(argumentsJson)
            val action = args.getString("action")
            when (action) {
                "status" -> runGit(ws.rootDir, listOf("status", "--porcelain"))
                "diff" -> {
                    val path = args.optString("path", "")
                    val cmd = if (path.isNotBlank()) {
                        listOf("diff", "--", path)
                    } else {
                        listOf("diff")
                    }
                    runGit(ws.rootDir, cmd)
                }
                else -> ToolResult(false, "", "Unknown action: $action")
            }
        } catch (e: Exception) {
            ToolResult(false, "", e.message ?: e.toString())
        }
    }

    private fun runGit(cwd: File, args: List<String>): ToolResult {
        return try {
            val pb = ProcessBuilder(listOf("git") + args)
                .directory(cwd)
                .redirectErrorStream(true)
            val process = pb.start()
            val output = process.inputStream.bufferedReader().readText()
            val code = process.waitFor()
            if (code == 0) {
                ToolResult(true, output.ifBlank { "(clean)" })
            } else {
                ToolResult(false, output, "git exited with code $code")
            }
        } catch (e: Exception) {
            ToolResult(
                false,
                "",
                "git not available or failed: ${e.message}. " +
                    "Install git or open a workspace that is a git repository."
            )
        }
    }
}
