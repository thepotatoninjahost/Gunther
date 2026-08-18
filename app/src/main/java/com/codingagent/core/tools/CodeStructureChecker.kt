package com.codingagent.core.tools

import org.json.JSONObject

/**
 * Lexically analyzes source for structural issues (unmatched braces, etc.).
 * Pure string analysis — no compilation or external tools required.
 */
class CodeStructureChecker : AgentTool {
    override val name = "check_structure"
    override val description = "Analyze source code for structural issues such as unmatched braces, parentheses, and brackets. Returns a JSON report."
    override val parametersSchema = JSONObject("""
        {
          "type": "object",
          "properties": {
            "source": {
              "type": "string",
              "description": "The source code text to analyze"
            },
            "path": {
              "type": "string",
              "description": "Optional file path for context in the report"
            }
          },
          "required": ["source"]
        }
    """.trimIndent())

    override suspend fun execute(args: JSONObject): String {
        val source = args.optString("source", "")
        val path = args.optString("path", "")
        val report = analyze(source)
        if (path.isNotEmpty()) {
            report.path = path
        }
        return report.toJson()
    }

    fun analyze(source: String): StructureReport {
        val issues = mutableListOf<StructureIssue>()
        val stack = ArrayDeque<Pair<Char, Int>>() // char, line
        var line = 1
        var col = 0
        var i = 0
        val len = source.length

        fun open(c: Char, depth: Int) {
            stack.addLast(c to line)
        }

        while (i < len) {
            val c = source[i]
            when {
                c == '\n' -> {
                    line++
                    col = 0
                }
                c == '/' && i + 1 < len && source[i + 1] == '/' -> {
                    // skip line comment
                    while (i < len && source[i] != '\n') i++
                    continue
                }
                c == '/' && i + 1 < len && source[i + 1] == '*' -> {
                    // skip block comment
                    i += 2
                    while (i + 1 < len && !(source[i] == '*' && source[i + 1] == '/')) {
                        if (source[i] == '\n') {
                            line++
                            col = 0
                        }
                        i++
                    }
                    i += 2
                    continue
                }
                c == '"' || c == '\'' -> {
                    // skip string/char literal (simple)
                    val quote = c
                    i++
                    while (i < len && source[i] != quote) {
                        if (source[i] == '\\' && i + 1 < len) i++
                        if (source[i] == '\n') {
                            line++
                            col = 0
                        }
                        i++
                    }
                }
                c == '{' || c == '(' || c == '[' -> {
                    open(c, stack.size)
                }
                c == '}' || c == ')' || c == ']' -> {
                    val expected = when (c) {
                        '}' -> '{'
                        ')' -> '('
                        ']' -> '['
                        else -> '?'
                    }
                    if (stack.isEmpty()) {
                        issues.add(StructureIssue(line, col, "Unexpected closing '$c'"))
                    } else {
                        val (top, topLine) = stack.removeLast()
                        if (top != expected) {
                            issues.add(StructureIssue(line, col, "Mismatched '$c' (opened with '$top' at line $topLine)"))
                        }
                    }
                }
            }
            i++
            col++
        }

        while (stack.isNotEmpty()) {
            val (openChar, openLine) = stack.removeLast()
            issues.add(StructureIssue(openLine, 0, "Unclosed '$openChar'"))
        }

        return StructureReport(issues = issues)
    }

    data class StructureIssue(val line: Int, val column: Int, val message: String)

    data class StructureReport(
        var path: String = "",
        val issues: List<StructureIssue>
    ) {
        fun toJson(): String {
            val root = JSONObject()
            if (path.isNotEmpty()) root.put("path", path)
            root.put("issueCount", issues.size)
            val arr = org.json.JSONArray()
            for (iss in issues) {
                val o = JSONObject()
                o.put("line", iss.line)
                o.put("column", iss.column)
                o.put("message", iss.message)
                arr.put(o)
            }
            root.put("issues", arr)
            return root.toString(2)
        }
    }
}
