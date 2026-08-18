package com.codingagent.core.tools

import org.json.JSONObject

/**
 * Lexical structure checker for source files. Reports basic issues without full parsing.
 * Used by the agent to validate code structure before/after edits.
 */
class CodeStructureChecker : AgentTool {

    override val name: String = "check_structure"

    override val description: String =
        "Check the lexical structure of a source file or directory. Reports unbalanced braces, missing package, empty files, and basic issues."

    override val parametersSchema: String = """
        {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Relative path to file or directory to check"
            }
          },
          "required": ["path"]
        }
    """.trimIndent()

    override suspend fun execute(args: Map<String, Any?>): String {
        val path = args["path"] as? String ?: return errorJson("Missing path")
        val root = java.io.File(path)
        if (!root.exists()) return errorJson("Path does not exist: $path")

        val issues = mutableListOf<JSONObject>()
        if (root.isFile) {
            checkFile(root, issues)
        } else if (root.isDirectory) {
            root.walkTopDown()
                .filter { it.isFile && isSourceFile(it) }
                .forEach { checkFile(it, issues) }
        } else {
            return errorJson("Not a file or directory: $path")
        }

        return toResultJson(issues)
    }

    private fun isSourceFile(f: java.io.File): Boolean {
        val name = f.name.lowercase()
        return name.endsWith(".kt") || name.endsWith(".java") || name.endsWith(".py") ||
                name.endsWith(".js") || name.endsWith(".ts") || name.endsWith(".tsx") ||
                name.endsWith(".go") || name.endsWith(".rs") || name.endsWith(".c") ||
                name.endsWith(".cpp") || name.endsWith(".h") || name.endsWith(".hpp")
    }

    private fun checkFile(file: java.io.File, issues: MutableList<JSONObject>) {
        val text = try {
            file.readText()
        } catch (e: Exception) {
            issues.add(issue(file.path, "read_error", e.message ?: "cannot read"))
            return
        }

        if (text.isBlank()) {
            issues.add(issue(file.path, "empty", "File is empty"))
            return
        }

        // Unbalanced braces / brackets / parens (simple count)
        val pairs = listOf('{' to '}', '[' to ']', '(' to ')')
        for ((open, close) in pairs) {
            val openCount = text.count { it == open }
            val closeCount = text.count { it == close }
            if (openCount != closeCount) {
                issues.add(
                    issue(
                        file.path,
                        "unbalanced",
                        "Unbalanced $open/$close: open=$openCount close=$closeCount"
                    )
                )
            }
        }

        // Kotlin/Java package check for .kt/.java
        val lower = file.name.lowercase()
        if (lower.endsWith(".kt") || lower.endsWith(".java")) {
            if (!text.contains(Regex("^\\s*package\\s+", RegexOption.MULTILINE))) {
                issues.add(issue(file.path, "missing_package", "No package declaration found"))
            }
        }

        // Very large single line (possible minified or error)
        val longLine = text.lines().any { it.length > 500 }
        if (longLine) {
            issues.add(issue(file.path, "long_line", "Contains line longer than 500 characters"))
        }
    }

    private fun issue(path: String, code: String, message: String): JSONObject {
        return JSONObject().apply {
            put("path", path)
            put("code", code)
            put("message", message)
        }
    }

    private fun errorJson(msg: String): String {
        return JSONObject().apply {
            put("ok", false)
            put("error", msg)
        }.toString(2)
    }

    private fun toResultJson(issues: List<JSONObject>): String {
        val root = JSONObject()
        root.put("ok", true)
        root.put("issueCount", issues.size)
        val arr = org.json.JSONArray()
        issues.forEach { arr.put(it) }
        root.put("issues", arr)
        return root.toString(2)
    }
}
