package com.codingagent.core.agent

import com.codingagent.core.backend.FinishReason
import com.codingagent.core.backend.GenerationOptions
import com.codingagent.core.backend.ModelBackend
import com.codingagent.core.backend.ModelChunk
import com.codingagent.core.backend.ToolCall
import com.codingagent.core.tools.ToolCallParser
import com.codingagent.core.tools.ToolExecutor
import com.codingagent.core.tools.ToolRegistry
import com.codingagent.core.workspace.ChatMessage
import com.codingagent.core.workspace.ConversationHistory
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import org.json.JSONArray
import org.json.JSONObject

/**
 * Agent turn runner: model → (optional) tool calls → execute → feed results → model …
 *
 * Emits [AgentEvent]s so the UI can stream assistant text, show tool activity,
 * and know when the turn is finished — without owning the loop itself.
 *
 * Rules:
 * - Tools are only injected when [ModelBackend.supportsTools] is true and
 *   [GenerationOptions.enableTools] is true.
 * - Max tool rounds is capped to prevent infinite loops.
 * - Tool results are written into conversation history as TOOL messages and
 *   also appended to the prompt for the next model call.
 * - Structured [ToolCall]s from the backend are preferred; text-embedded calls
 *   are parsed as a fallback (for stubs / open models).
 */
class AgentRuntime(
    private val toolRegistry: ToolRegistry,
    private val maxToolRounds: Int = 8
) {
    private val executor = ToolExecutor(toolRegistry)

    /**
     * Run one user turn to completion (including any tool rounds).
     *
     * @param userMessage Already cleaned user text (e.g. after VoiceInputCleaner).
     * @param systemPrompt Full system prompt including SESSION CONTEXT.
     * @param history Mutable conversation history; this method appends USER,
     *   ASSISTANT, and TOOL messages as it goes.
     * @param backend Active model backend.
     * @param options Generation options for each model call.
     * @param recordUserMessage When true (default), appends the user message
     *   to [history]. Set false if the caller already recorded it.
     */
    fun runTurn(
        userMessage: String,
        systemPrompt: String,
        history: ConversationHistory,
        backend: ModelBackend,
        options: GenerationOptions = GenerationOptions(),
        recordUserMessage: Boolean = true
    ): Flow<AgentEvent> = flow {
        if (recordUserMessage) {
            history.addUser(userMessage)
            emit(AgentEvent.UserMessageRecorded(userMessage))
        }

        val toolsEnabled = options.enableTools && backend.supportsTools()
        var round = 0

        while (true) {
            val prompt = buildPrompt(systemPrompt, history, toolsEnabled)
            emit(AgentEvent.ModelStarted(round = round, toolsEnabled = toolsEnabled))

            val gather = collectModelOutput(backend, prompt, options, this)

            if (gather.errorMessage != null) {
                val msg = gather.text.ifBlank { "Model error: ${gather.errorMessage}" }
                history.addAssistant(msg)
                emit(AgentEvent.AssistantFinal(text = msg, toolCalls = emptyList()))
                emit(AgentEvent.TurnFinished(reason = FinishReason.ERROR, toolRounds = round))
                return@flow
            }

            val toolCalls = if (toolsEnabled) {
                ToolCallParser.collect(gather.text, gather.structuredCalls)
            } else {
                emptyList()
            }

            val visibleText = if (toolCalls.isNotEmpty()) {
                ToolCallParser.stripToolMarkup(gather.text)
            } else {
                gather.text
            }

            val toolCallsJson = if (toolCalls.isNotEmpty()) {
                toolCallsToJson(toolCalls)
            } else {
                null
            }

            history.addAssistant(
                visibleText.ifBlank {
                    if (toolCalls.isNotEmpty()) "(calling tools)" else ""
                },
                toolCallsJson
            )

            emit(AgentEvent.AssistantFinal(text = visibleText, toolCalls = toolCalls))

            if (toolCalls.isEmpty()) {
                emit(AgentEvent.TurnFinished(reason = gather.finishReason, toolRounds = round))
                return@flow
            }

            if (round >= maxToolRounds) {
                val notice = "Stopped: reached max tool rounds ($maxToolRounds)."
                history.addAssistant(notice)
                emit(AgentEvent.AssistantFinal(text = notice, toolCalls = emptyList()))
                emit(AgentEvent.TurnFinished(reason = FinishReason.STOP, toolRounds = round))
                return@flow
            }

            emit(AgentEvent.ToolsStarted(toolCalls))
            val results = executor.executeAll(toolCalls)
            for (r in results) {
                val content = r.toHistoryContent()
                history.add(
                    ChatMessage(
                        role = ChatMessage.Role.TOOL,
                        content = content,
                        toolCallsJson = r.toJsonSummary()
                    )
                )
                emit(
                    AgentEvent.ToolFinished(
                        call = r.call,
                        success = r.result.success,
                        output = if (r.result.success) {
                            r.result.output
                        } else {
                            r.result.error ?: ""
                        },
                        durationMs = r.durationMs
                    )
                )
            }
            emit(AgentEvent.ToolsRoundComplete(results.size))

            round++
        }
    }

    private suspend fun collectModelOutput(
        backend: ModelBackend,
        prompt: String,
        options: GenerationOptions,
        collector: FlowCollector<AgentEvent>
    ): ModelGather {
        val sb = StringBuilder()
        val structured = mutableListOf<ToolCall>()
        var finish = FinishReason.STOP
        var error: String? = null

        try {
            backend.streamResponse(prompt, options)
                .catch { e ->
                    error = e.message ?: e::class.java.simpleName
                    emit(
                        ModelChunk(
                            delta = "",
                            isFinal = true,
                            finishReason = FinishReason.ERROR
                        )
                    )
                }
                .collect { chunk ->
                    if (chunk.delta.isNotEmpty()) {
                        sb.append(chunk.delta)
                        collector.emit(AgentEvent.AssistantDelta(sb.toString()))
                    }
                    if (chunk.toolCalls.isNotEmpty()) {
                        structured.addAll(chunk.toolCalls)
                    }
                    if (chunk.isFinal) {
                        finish = chunk.finishReason ?: FinishReason.STOP
                    }
                }
        } catch (e: Exception) {
            error = e.message ?: e::class.java.simpleName
            finish = FinishReason.ERROR
        }

        return ModelGather(
            text = sb.toString(),
            structuredCalls = structured.toList(),
            finishReason = if (structured.isNotEmpty() && finish == FinishReason.STOP) {
                FinishReason.TOOL_CALLS
            } else {
                finish
            },
            errorMessage = error
        )
    }

    private fun buildPrompt(
        systemPrompt: String,
        history: ConversationHistory,
        toolsEnabled: Boolean
    ): String {
        return buildString {
            append(systemPrompt)
            if (toolsEnabled) {
                append("\n\n# Available tools\n")
                append("You may call tools by emitting one or more of:\n")
                append("1) Structured tool_calls (preferred when the API supports it).\n")
                append("2) XML blocks:\n")
                append("<tool_call>\n<name>TOOL_NAME</name>\n<arguments>JSON_OBJECT</arguments>\n</tool_call>\n")
                append("3) A JSON fence containing {\"tool_calls\":[{\"name\":\"...\",\"arguments\":{...}}]}.\n\n")
                append(toolRegistry.schemasForPrompt())
                append("\n\nAfter tool results are returned as Tool messages, continue the task.\n")
                append("Do not invent tool names. If you do not need a tool, answer normally.\n")
            }
            append("\n\n# Conversation\n")
            append(history.toPromptFragment())
        }
    }

    private fun toolCallsToJson(calls: List<ToolCall>): String {
        val arr = JSONArray()
        calls.forEach { c ->
            val o = JSONObject()
            o.put("id", c.id)
            o.put("name", c.name)
            o.put("arguments", c.argumentsJson)
            arr.put(o)
        }
        return arr.toString()
    }

    private data class ModelGather(
        val text: String,
        val structuredCalls: List<ToolCall>,
        val finishReason: FinishReason,
        val errorMessage: String?
    )
}

/**
 * Events emitted by [AgentRuntime.runTurn] for UI / logging.
 */
sealed class AgentEvent {
    data class UserMessageRecorded(val text: String) : AgentEvent()
    data class ModelStarted(val round: Int, val toolsEnabled: Boolean) : AgentEvent()
    data class AssistantDelta(val textSoFar: String) : AgentEvent()
    data class AssistantFinal(val text: String, val toolCalls: List<ToolCall>) : AgentEvent()
    data class ToolsStarted(val calls: List<ToolCall>) : AgentEvent()
    data class ToolFinished(
        val call: ToolCall,
        val success: Boolean,
        val output: String,
        val durationMs: Long
    ) : AgentEvent()
    data class ToolsRoundComplete(val count: Int) : AgentEvent()
    data class TurnFinished(val reason: FinishReason, val toolRounds: Int) : AgentEvent()
}
