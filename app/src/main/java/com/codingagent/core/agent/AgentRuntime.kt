package com.codingagent.core.agent

import com.codingagent.core.backend.FinishReason
import com.codingagent.core.backend.ModelBackend
import com.codingagent.core.backend.StreamEvent
import com.codingagent.core.backend.ToolCall
import com.codingagent.core.tools.ToolCallParser
import com.codingagent.core.tools.ToolExecutor
import com.codingagent.core.workspace.ConversationHistory
import com.codingagent.core.workspace.ProjectWorkspace
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Core agent loop: prompt → model stream → parse tool calls → execute → feed results back.
 * Emits [AgentEvent] for the UI to render.
 */
class AgentRuntime(
    private val backend: ModelBackend,
    private val toolExecutor: ToolExecutor,
    private val workspace: ProjectWorkspace,
    private val history: ConversationHistory,
    private val systemPrompt: String = RuntimePrompt.DEFAULT_SYSTEM,
    private val maxToolRounds: Int = 8,
) {
    fun run(userMessage: String): Flow<AgentEvent> = flow {
        history.addUser(userMessage)
        emit(AgentEvent.UserMessage(userMessage))

        var rounds = 0
        var continueLoop = true
        while (continueLoop && rounds < maxToolRounds) {
            rounds++
            val messages = history.toMessages(systemPrompt)
            var assistantText = StringBuilder()
            val toolCalls = mutableListOf<ToolCall>()
            var finishReason: FinishReason? = null

            backend.stream(messages).collect { event ->
                when (event) {
                    is StreamEvent.Token -> {
                        assistantText.append(event.text)
                        emit(AgentEvent.Token(event.text))
                    }
                    is StreamEvent.ToolCallDelta -> {
                        // accumulate handled by parser later
                    }
                    is StreamEvent.Finished -> {
                        finishReason = event.reason
                    }
                    is StreamEvent.Error -> {
                        emit(AgentEvent.Error(event.message))
                        continueLoop = false
                        return@collect
                    }
                }
            }

            val fullText = assistantText.toString()
            val parsed = ToolCallParser.parse(fullText)
            if (parsed.toolCalls.isNotEmpty()) {
                toolCalls.addAll(parsed.toolCalls)
                history.addAssistant(parsed.cleanText.ifBlank { fullText }, toolCalls)
                emit(AgentEvent.AssistantMessage(parsed.cleanText.ifBlank { fullText }))

                for (tc in toolCalls) {
                    emit(AgentEvent.ToolCallStarted(tc))
                    val result = toolExecutor.execute(tc, workspace)
                    history.addToolResult(tc.id, result)
                    emit(AgentEvent.ToolResult(tc.id, tc.name, result))
                }
                // loop continues for next model turn with tool results
            } else {
                history.addAssistant(fullText, emptyList())
                emit(AgentEvent.AssistantMessage(fullText))
                continueLoop = false
                emit(AgentEvent.TurnFinished(finishReason ?: FinishReason.STOP, rounds))
            }
        }
        if (rounds >= maxToolRounds) {
            emit(AgentEvent.Error("Max tool rounds ($maxToolRounds) reached"))
            emit(AgentEvent.TurnFinished(FinishReason.LENGTH, rounds))
        }
    }
}

sealed class AgentEvent {
    data class UserMessage(val text: String) : AgentEvent()
    data class Token(val text: String) : AgentEvent()
    data class AssistantMessage(val text: String) : AgentEvent()
    data class ToolCallStarted(val call: ToolCall) : AgentEvent()
    data class ToolResult(val callId: String, val name: String, val result: String) : AgentEvent()
    data class Error(val message: String) : AgentEvent()
    data class TurnFinished(val reason: FinishReason, val toolRounds: Int) : AgentEvent()
}
