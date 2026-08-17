package com.codingagent.core.tools

import com.codingagent.core.workspace.ProjectWorkspace
import org.json.JSONObject
import java.nio.charset.Charset

/**
 * File read / write restricted to the active project workspace.
 * Paths are always resolved relative to the workspace root; absolute or
 * ".." escapes are rejected by ProjectWorkspace.resolve().
 *
 * Successful read/write operations are recorded on the workspace session
 * file log so they appear in SESSION CONTEXT and the session state panel.
 */
class FileTool(
    private val workspaceProvider: () -> ProjectWorkspace?
) : AgentTool {

    override val name: String = "file"

    override val description: String =
        "Read or write a text file inside the current project workspace. " +
        "Paths are relative to the project root. Use action=read|write|list."

    override val parametersSchemaJson: String = """
        {
          "type": "object",
          "properties": {
            "action": { "type": "string", "enum": ["read", "write", "list"] },
            "path": { "type": "string", "description": "Relative path from project root" },
            "content": { "type": "string", "description": "Required for write" },
            "encoding": { "type": "string", "default": "UTF-8" }
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
                "list" -> {
                    val files = ws.listFilesRecursive()
                    ToolResult(true, files.joinToString("\n"))
                }
                "read" -> {
                    val path = args.getString("path")
                    val file = ws.resolve(path)
                    if (!file.exists() || !file.isFile) {
                        return ToolResult(false, "", "File not found: $path")
                    }
                    val encoding = args.optString("encoding", "UTF-8")
                    val text = file.readText(Charset.forName(encoding))
                    ws.recordFileTouched(path)
                    ToolResult(true, text)
                }
                "write" -> {
                    val path = args.getString("path")
                    val content = args.getString("content")
                    val encoding = args.optString("encoding", "UTF-8")
                    val file = ws.resolve(path)
                    file.parentFile?.mkdirs()
                    file.writeText(content, Charset.forName(encoding))
                    ws.recordFileTouched(path)
                    ToolResult(true, "Wrote ${content.length} chars to $path")
                }
                else -> ToolResult(false, "", "Unknown action: $action")
            }
        } catch (e: Exception) {
            ToolResult(false, "", e.message ?: e.toString())
        }
    }
}
