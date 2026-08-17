package com.codingagent.core.backend

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.UUID

/**
 * Cloud API backend stub.
 *
 * In a real deployment this would open an OkHttp / Ktor client, attach the
 * API key from Keystore, and stream SSE or WebSocket tokens.
 *
 * The stub returns deterministic, offline-safe responses so the agent runtime
 * (including the tool loop) can be exercised without network. When the prompt
 * looks like a simple tool request (list files, git status), it emits an
 * XML tool_call so [com.codingagent.core.agent.AgentRuntime] can run the
 * real FileTool / GitTool. After tool results appear in the conversation,
 * it answers in plain text.
 *
 * Replace [streamResponse] / [sendPrompt] with real HTTP when wiring a
 * production endpoint — keep the same [ModelBackend] surface.
 */
class CloudBackend(
    private val config: BackendConfig,
    private val apiKeyProvider: (String?) -> String?
) : ModelBackend {

    override val id: String = ID
    override val displayName: String = DISPLAY_NAME
    override val isOnDevice: Boolean = false

    private val clientReady: Boolean

    init {
        val key = apiKeyProvider(config.keystoreAlias)
        clientReady = key != null || config.keystoreAlias == null
    }

    override fun supportsTools(): Boolean = true

    override suspend fun isReady(): Boolean = clientReady

    override suspend fun sendPrompt(
        prompt: String,
        options: GenerationOptions
    ): ModelResponse {
        delay(300)
        val plan = planStub(prompt, options)
        return ModelResponse(
            text = plan.text,
            toolCalls = plan.structuredCalls,
            finishReason = plan.finishReason,
            usage = TokenUsage(
                promptTokens = prompt.length / 4,
                completionTokens = plan.text.length / 4
            )
        )
    }

    override fun streamResponse(
        prompt: String,
        options: GenerationOptions
    ): Flow<ModelChunk> = flow {
        val plan = planStub(prompt, options)
        val words = plan.text.split(' ')
        for ((index, word) in words.withIndex()) {
            emit(ModelChunk(delta = if (index == 0) word else " $word"))
            delay(25)
        }
        emit(
            ModelChunk(
                delta = "",
                toolCalls = plan.structuredCalls,
                isFinal = true,
                finishReason = plan.finishReason
            )
        )
    }

    override fun close() {}

    /**
     * Very small intent router for offline demos of the tool loop.
     * Not a real model — only pattern-matches the last user turn.
     */
    private fun planStub(prompt: String, options: GenerationOptions): StubPlan {
        val toolsOn = options.enableTools && supportsTools()
        val lastUser = extractLastUser(prompt)?.lowercase().orEmpty()
        val hasToolResult = prompt.contains("Tool `") || prompt.contains("Tool:")

        // After tools already ran, give a plain summary (avoid re-calling forever).
        if (hasToolResult) {
            return StubPlan(
                text = buildString {
                    appendLine("Tool results received. (CloudBackend stub)")
                    appendLine("In a real backend the model would interpret those results")
                    appendLine("and continue the task. Session is ready for the next instruction.")
                }.trim(),
                structuredCalls = emptyList(),
                finishReason = FinishReason.STOP
            )
        }

        if (toolsOn && lastUser.contains("list") && (lastUser.contains("file") || lastUser.contains("workspace") || lastUser.contains("project"))) {
            val args = """{"action":"list"}"""
            val xml = """
                I'll list the project files.
                <tool_call>
                <name>file</name>
                <arguments>$args</arguments>
                </tool_call>
            """.trimIndent()
            return StubPlan(
                text = xml,
                structuredCalls = listOf(
                    ToolCall(id = UUID.randomUUID().toString(), name = "file", argumentsJson = args)
                ),
                finishReason = FinishReason.TOOL_CALLS
            )
        }

        if (toolsOn && lastUser.contains("git") && lastUser.contains("status")) {
            val args = """{"action":"status"}"""
            val xml = """
                Checking git status.
                <tool_call>
                <name>git</name>
                <arguments>$args</arguments>
                </tool_call>
            """.trimIndent()
            return StubPlan(
                text = xml,
                structuredCalls = listOf(
                    ToolCall(id = UUID.randomUUID().toString(), name = "git", argumentsJson = args)
                ),
                finishReason = FinishReason.TOOL_CALLS
            )
        }

        if (toolsOn && (lastUser.contains("structure") || lastUser.contains("brace") || lastUser.contains("balance"))) {
            // Demo structure check on a tiny snippet
            val snippet = """fun main() { println("hi") }"""
            val args = """{"source":${org.json.JSONObject.quote(snippet)}}"""
            val xml = """
                Running a structure check on a sample snippet.
                <tool_call>
                <name>code_structure_check</name>
                <arguments>$args</arguments>
                </tool_call>
            """.trimIndent()
            return StubPlan(
                text = xml,
                structuredCalls = listOf(
                    ToolCall(
                        id = UUID.randomUUID().toString(),
                        name = "code_structure_check",
                        argumentsJson = args
                    )
                ),
                finishReason = FinishReason.TOOL_CALLS
            )
        }

        val model = config.modelName ?: "cloud-stub"
        val preview = prompt.takeLast(100).replace('\n', ' ')
        return StubPlan(
            text = buildString {
                appendLine("[CloudBackend:$model] stub reply (len=${prompt.length}).")
                appendLine("Last prompt slice: …$preview")
                appendLine()
                appendLine("No tool intent matched. Try: \"list files\", \"git status\",")
                appendLine("or \"check structure\" to exercise the tool loop offline.")
                if (toolsOn) appendLine("(tools enabled)")
            }.trim(),
            structuredCalls = emptyList(),
            finishReason = FinishReason.STOP
        )
    }

    private fun extractLastUser(prompt: String): String? {
        val marker = "User:"
        val idx = prompt.lastIndexOf(marker)
        if (idx < 0) return null
        val after = prompt.substring(idx + marker.length)
        val next = listOf("\nAssistant:", "\nTool:", "\nSystem:").map { after.indexOf(it) }.filter { it >= 0 }.minOrNull()
        return if (next != null) after.substring(0, next).trim() else after.trim()
    }

    private data class StubPlan(
        val text: String,
        val structuredCalls: List<ToolCall>,
        val finishReason: FinishReason
    )

    companion object {
        const val ID = "cloud-api"
        const val DISPLAY_NAME = "Cloud API (stub)"
    }
}
