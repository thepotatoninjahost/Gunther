package com.codingagent.core.tools

import com.codingagent.core.backend.ToolCall
import org.json.JSONArray
import org.json.JSONObject

/**
 * Parses tool-call markup from model responses.
 * Supports both XML-style <tool_call> and JSON blocks the cloud stub emits.
 */
class ToolCallParser {

    fun parse(text: String): List<ToolCall> {
        val results = mutableListOf<ToolCall>()
        // XML style
        val xmlRegex = Regex(
            """<tool_call>\s*<name>(.*?)</name>\s*<arguments>(.*?)</arguments>\s*</tool_call>""",
            setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE)
        )
        for (m in xmlRegex.findAll(text)) {
            val name = m.groupValues[1].trim()
            val argsRaw = m.groupValues[2].trim()
            results.add(ToolCall(name, parseArgs(argsRaw)))
        }
        if (results.isNotEmpty()) return results

        // JSON style: {"tool_calls": [{"name": "...", "arguments": {...}}]}
        try {
            val trimmed = text.trim()
            if (trimmed.startsWith("{") && "tool_calls" in trimmed) {
                val root = JSONObject(trimmed)
                val arr = root.optJSONArray("tool_calls") ?: return results
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val name = obj.getString("name")
                    val argsObj = obj.optJSONObject("arguments") ?: JSONObject()
                    val map = mutableMapOf<String, Any?>()
                    argsObj.keys().forEach { k -> map[k] = argsObj.get(k) }
                    results.add(ToolCall(name, map))
                }
            }
        } catch (_: Exception) {
            // ignore parse errors, return what we have
        }
        return results
    }

    private fun parseArgs(raw: String): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        val trimmed = raw.trim()
        if (trimmed.startsWith("{")) {
            try {
                val obj = JSONObject(trimmed)
                obj.keys().forEach { k -> map[k] = obj.get(k) }
                return map
            } catch (_: Exception) {}
        }
        // key=value lines or simple
        for (line in trimmed.lines()) {
            val idx = line.indexOf('=')
            if (idx > 0) {
                val k = line.substring(0, idx).trim()
                val v = line.substring(idx + 1).trim()
                map[k] = v
            }
        }
        return map
    }

    /** Strip tool-call markup from the visible reply text. */
    fun stripToolMarkup(text: String): String {
        var result = text
        val xmlRegex = Regex(
            """<tool_call>.*?</tool_call>""",
            setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE)
        )
        result = xmlRegex.replace(result) { "" }
        // also remove JSON tool_calls blocks if they appear alone
        try {
            val trimmed = result.trim()
            if (trimmed.startsWith("{") && "tool_calls" in trimmed) {
                val root = JSONObject(trimmed)
                if (root.has("tool_calls") && !root.has("content") && !root.has("message")) {
                    return ""
                }
            }
        } catch (_: Exception) {}
        return result.replace(Regex("\n{3,}"), "\n\n").trim()
    }
}
