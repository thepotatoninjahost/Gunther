package com.codingagent.core.tools

import org.json.JSONObject

/**
 * Lexically-aware structure checker for common languages (Kotlin/Java/JS/TS/C-like).
 *
 * Not a full parser. It tracks brace / paren / bracket depth while correctly
 * skipping:
 * - line comments (//)
 * - block comments (/* */)
 * - single- and double-quoted strings (with basic escape handling)
 * - template / raw strings are treated conservatively (depth still tracked)
 *
 * Returns a structured report the agent can act on. This is intentionally
 * more robust than naive brace counting.
 */
class CodeStructureChecker : AgentTool {

    override val name: String = "code_structure_check"

    override val description: String =
        "Check brace/paren/bracket balance and basic structure of source text. " +
        "Handles strings and comments correctly. Pass the full file content."

    override val parametersSchemaJson: String = """
        {
          "type": "object",
          "properties": {
            "source": { "type": "string", "description": "Full source text to check" },
            "language": { "type": "string", "description": "Optional hint: kotlin, java, js, ..." }
          },
          "required": ["source"]
        }
    """.trimIndent()

    override suspend fun invoke(argumentsJson: String): ToolResult {
        return try {
            val args = JSONObject(argumentsJson)
            val source = args.getString("source")
            val report = analyze(source)
            ToolResult(true, report.toJson())
        } catch (e: Exception) {
            ToolResult(false, "", e.message ?: e.toString())
        }
    }

    fun analyze(source: String): StructureReport {
        var line = 1
        var col = 0
        var i = 0
        val n = source.length

        var brace = 0
        var paren = 0
        var bracket = 0
        val issues = mutableListOf<StructureIssue>()

        var inLineComment = false
        var inBlockComment = false
        var inSingleQuote = false
        var inDoubleQuote = false
        var escape = false

        fun open(c: Char, depth: Int) {
            if (depth < 0) {
                issues.add(
                    StructureIssue(
                        line, col,
                        "Unexpected closing '$c' (depth went negative)"
                    )
                )
            }
        }

        while (i < n) {
            val c = source[i]
            col++
            if (c == '\n') {
                line++
                col = 0
                inLineComment = false
                escape = false
                i++
                continue
            }

            if (inLineComment) {
                i++
                continue
            }
            if (inBlockComment) {
                if (c == '*' && i + 1 < n && source[i + 1] == '/') {
                    inBlockComment = false
                    i += 2
                    col++
                    continue
                }
                i++
                continue
            }
            if (inSingleQuote) {
                if (escape) {
                    escape = false
                } else if (c == '\\') {
                    escape = true
                } else if (c == '\'') {
                    inSingleQuote = false
                }
                i++
                continue
            }
            if (inDoubleQuote) {
                if (escape) {
                    escape = false
                } else if (c == '\\') {
                    escape = true
                } else if (c == '"') {
                    inDoubleQuote = false
                }
                i++
                continue
            }

            // Not in comment or string.
            when {
                c == '/' && i + 1 < n && source[i + 1] == '/' -> {
                    inLineComment = true
                    i += 2
                    col++
                    continue
                }
                c == '/' && i + 1 < n && source[i + 1] == '*' -> {
                    inBlockComment = true
                    i += 2
                    col++
                    continue
                }
                c == '\'' -> {
                    inSingleQuote = true
                    i++
                    continue
                }
                c == '"' -> {
                    inDoubleQuote = true
                    i++
                    continue
                }
                c == '{' -> {
                    brace++
                    i++
                    continue
                }
                c == '}' -> {
                    brace--
                    open(c, brace)
                    i++
                    continue
                }
                c == '(' -> {
                    paren++
                    i++
                    continue
                }
                c == ')' -> {
                    paren--
                    open(c, paren)
                    i++
                    continue
                }
                c == '[' -> {
                    bracket++
                    i++
                    continue
                }
                c == ']' -> {
                    bracket--
                    open(c, bracket)
                    i++
                    continue
                }
                else -> {
                    i++
                }
            }
        }

        if (inBlockComment) {
            issues.add(StructureIssue(line, col, "Unterminated block comment"))
        }
        if (inSingleQuote) {
            issues.add(StructureIssue(line, col, "Unterminated single-quoted string"))
        }
        if (inDoubleQuote) {
            issues.add(StructureIssue(line, col, "Unterminated double-quoted string"))
        }
        if (brace != 0) {
            issues.add(StructureIssue(line, col, "Unbalanced braces: final depth=$brace"))
        }
        if (paren != 0) {
            issues.add(StructureIssue(line, col, "Unbalanced parentheses: final depth=$paren"))
        }
        if (bracket != 0) {
            issues.add(StructureIssue(line, col, "Unbalanced brackets: final depth=$bracket"))
        }

        return StructureReport(
            balanced = issues.isEmpty(),
            braceDepth = brace,
            parenDepth = paren,
            bracketDepth = bracket,
            issues = issues
        )
    }

    data class StructureIssue(val line: Int, val column: Int, val message: String)
    data class StructureReport(
        val balanced: Boolean,
        val braceDepth: Int,
        val parenDepth: Int,
        val bracketDepth: Int,
        val issues: List<StructureIssue>
    ) {
        fun toJson(): String {
            val root = JSONObject()
            root.put("balanced", balanced)
            root.put("braceDepth", braceDepth)
            root.put("parenDepth", parenDepth)
            root.put("bracketDepth", bracketDepth)
            val arr = org.json.JSONArray()
            issues.forEach { issue ->
                val o = JSONObject()
                o.put("line", issue.line)
                o.put("column", issue.column)
                o.put("message", issue.message)
                arr.put(o)
            }
            root.put("issues", arr)
            return root.toString(2)
        }
    }
}
