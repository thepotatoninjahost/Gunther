package com.codingagent.core.tools

import com.codingagent.core.backend.ToolCall
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Extracts [ToolCall]s from model output.
 *
 * Supports three shapes so both structured backends and text-only stubs work:
 *
 * 1. Already-parsed [ToolCall] list from [com.codingagent.core.backend.ModelChunk]
 *    or [com.codingagent.core.backend.ModelResponse] (preferred).
 * 2. JSON tool-call blocks embedded in assistant text:
 *    ```json
 *    {"tool_calls":[{"name":"file","arguments":{...}}]}
 *    ```
 *    or a bare array of call objects.
 * 3. XML-style tags (common in open models / prompted stubs):
 *    <tool_call>
 *      <name>file</name>
 *      <arguments>{"action":"list"}</arguments>
 *    </tool_call>
 *
 * Malformed fragments are ignored rather than crashing the agent loop.
 */
object ToolCallParser {

    private val XML_BLOCK = Regex(
        """<tool_call>\s*<name>\s*([^<]+?)\s*</name>\s*<arguments>\s*([\s\S]*?)\s*</arguments>\s*</tool_call>""",
        RegexOption.IGNORE_CASE
    )

    private val JSON_FENCE = Regex(
        """```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```""",
        RegexOption.IGNORE_CASE
    )

    /**
     * Merge structured calls from the backend with any calls parsed from [text].
     * Structured calls win on id collision.
     */
    fun collect(
        text: String,
        structured: List<ToolCall> = emptyList()
    ): List<ToolCall> {
        val fromText = parseFromText(text)
        if (structured.isEmpty()) return fromText
        if (fromText.isEmpty()) return structured

        val byId = linkedMapOf<String, ToolCall>()
        fromText.forEach { byId[it.id] = it }
        structured.forEach { byId[it.id] = it }
        return byId.values.toList()
    }

    fun parseFromText(text: String): List<ToolCall> {
        if (text.isBlank()) return emptyList()
        val found = mutableListOf<ToolCall>()

        // XML-style
        XML_BLOCK.findAll(text).forEach { match ->
            val name = match.groupValues[1].trim()
            val argsRaw = match.groupValues[2].trim()
            val args = normalizeArguments(argsRaw)
            if (name.isNotEmpty()) {
                found.add(
                    ToolCall(
                        id = UUID.randomUUID().toString(),
                        name = name,
                        argumentsJson = args
                    )
                )
            }
        }

        // Fenced JSON
        JSON_FENCE.findAll(text).forEach { match ->
            found.addAll(parseJsonFragment(match.groupValues[1]))
        }

        // Bare JSON object/array that looks like tool calls (last resort, whole text)
        if (found.isEmpty()) {
            val trimmed = text.trim()
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                found.addAll(parseJsonFragment(trimmed))
            }
        }

        return found
    }

    private fun parseJsonFragment(raw: String): List<ToolCall> {
        return try {
            val calls = mutableListOf<ToolCall>()
            when {
                raw.trimStart().startsWith("[") -> {
                    val arr = JSONArray(raw)
                    for (i in 0 until arr.length()) {
                        parseOneObject(arr.getJSONObject(i))?.let { calls.add(it) }
                    }
                }
                else -> {
                    val obj = JSONObject(raw)
                    when {
                        obj.has("tool_calls") -> {
                            val arr = obj.getJSONArray("tool_calls")
                            for (i in 0 until arr.length()) {
                                parseOneObject(arr.getJSONObject(i))?.let { calls.add(it) }
                            }
                        }
                        obj.has("name") -> {
                            parseOneObject(obj)?.let { calls.add(it) }
                        }
                    }
                }
            }
            calls
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun parseOneObject(obj: JSONObject): ToolCall? {
        val name = obj.optString("name", "").ifBlank {
            obj.optJSONObject("function")?.optString("name", "") ?: ""
        }
        if (name.isBlank()) return null

        val id = obj.optString("id", "").ifBlank { UUID.randomUUID().toString() }

        val args: String = when {
            obj.has("arguments") -> {
                val v = obj.get("arguments")
                when (v) {
                    is JSONObject -> v.toString()
                    is String -> normalizeArguments(v)
                    else -> v.toString()
                }
            }
            obj.has("argumentsJson") -> obj.getString("argumentsJson")
            obj.optJSONObject("function")?.has("arguments") == true -> {
                val v = obj.getJSONObject("function").get("arguments")
                when (v) {
                    is JSONObject -> v.toString()
                    is String -> normalizeArguments(v)
                    else -> v.toString()
                }
            }
            else -> "{}"
        }

        return ToolCall(id = id, name = name, argumentsJson = args)
    }

    /** Ensure arguments is a JSON object string. */
    private fun normalizeArguments(raw: String): String {
        val t = raw.trim()
        if (t.isEmpty()) return "{}"
        return try {
            when {
                t.startsWith("{") -> JSONObject(t).toString()
                t.startsWith("[") -> JSONObject().put("items", JSONArray(t)).toString()
                else -> JSONObject().put("value", t).toString()
            }
        } catch (_: Exception) {
            JSONObject().put("raw", t).toString()
        }
    }

    /**
     * Strip tool-call markup from assistant-visible text so the user sees
     * prose, not raw XML/JSON call blocks.
     */
    fun stripToolMarkup(text: String): String {
        var result = XML_BLOCK.replace(text, "")
        // Remove fenced blocks that were pure tool_calls payloads
        result = JSON_FENCE.replace(result) { match ->
            val inner = match.groupValues[1]
            val parsed = parseJsonFragment(inner)
            if (parsed.isNotEmpty()) "" else match.value
        }
        return result.replace(Regex("\n{3,}"), "\n\n").trim()
    }
}
