package com.codingagent.core.tools

import com.codingagent.core.backend.ToolCall
import org.json.JSONObject

/**
 * Runs one or more [ToolCall]s against a [ToolRegistry].
 *
 * Execution is sequential by default (safer for file writes that depend on
 * prior reads). Parallel execution can be added later for pure read tools.
 *
 * Unknown tool names and invoke exceptions become failed [ToolExecutionResult]s
 * rather than throwing out of the agent loop.
 */
class ToolExecutor(
    private val registry: ToolRegistry
) {

    data class ToolExecutionResult(
        val call: ToolCall,
        val result: ToolResult,
        val durationMs: Long
    ) {
        fun toHistoryContent(): String {
            return buildString {
                append("Tool `").append(call.name).append("`")
                if (call.id.isNotBlank()) append(" (id=").append(call.id).append(")")
                append(": ")
                if (result.success) {
                    append("ok\n")
                    append(result.output)
                } else {
                    append("error\n")
                    append(result.error ?: result.output.ifBlank { "unknown error" })
                }
            }
        }

        fun toJsonSummary(): String {
            val obj = JSONObject()
            obj.put("tool_call_id", call.id)
            obj.put("name", call.name)
            obj.put("success", result.success)
            obj.put("output", result.output)
            if (result.error != null) obj.put("error", result.error)
            obj.put("duration_ms", durationMs)
            return obj.toString()
        }
    }

    suspend fun execute(call: ToolCall): ToolExecutionResult {
        val tool = registry.get(call.name)
        val started = System.currentTimeMillis()
        val result = if (tool == null) {
            ToolResult(
                success = false,
                output = "",
                error = "Unknown tool: `${call.name}`. Available: ${registry.all().joinToString { it.name }}"
            )
        } else {
            try {
                tool.invoke(call.argumentsJson.ifBlank { "{}" })
            } catch (e: Exception) {
                ToolResult(
                    success = false,
                    output = "",
                    error = "Tool `${call.name}` threw: ${e.message ?: e::class.java.simpleName}"
                )
            }
        }
        return ToolExecutionResult(
            call = call,
            result = result,
            durationMs = System.currentTimeMillis() - started
        )
    }

    suspend fun executeAll(calls: List<ToolCall>): List<ToolExecutionResult> {
        if (calls.isEmpty()) return emptyList()
        val out = ArrayList<ToolExecutionResult>(calls.size)
        for (call in calls) {
            out.add(execute(call))
        }
        return out
    }
}
