package com.codingagent.core.backend

import kotlinx.coroutines.flow.Flow

/**
 * Model-agnostic backend contract.
 *
 * Every concrete model (cloud API, on-device NNAPI/GGUF, future local runtime)
 * implements this interface. The rest of the app only depends on this type.
 *
 * Design rules:
 * - No UI types leak in.
 * - Streaming is first-class.
 * - Tool support is explicit so the agent runtime can decide whether to
 *   expose tools for the active backend.
 * - Cancellation must be cooperative (caller cancels the coroutine / flow).
 */
interface ModelBackend {

    /** Stable id used in settings and project config (e.g. "cloud-grok", "on-device-local"). */
    val id: String

    /** Human-readable name shown in the settings UI. */
    val displayName: String

    /** True when this backend can run without network. */
    val isOnDevice: Boolean

    /**
     * Whether the backend can accept tool definitions and return tool-call
     * messages. If false, the agent runtime must not inject tools into prompts.
     */
    fun supportsTools(): Boolean

    /**
     * Non-streaming completion. Prefer [streamResponse] for interactive use.
     *
     * @param prompt Fully assembled prompt (system + history + user turn).
     * @param options Generation parameters; backends may ignore unknown keys.
     * @return Complete model response text (or structured tool-call payload).
     */
    suspend fun sendPrompt(
        prompt: String,
        options: GenerationOptions = GenerationOptions()
    ): ModelResponse

    /**
     * Streaming completion. Emits partial tokens / chunks as they arrive.
     * The final emission may carry tool-call metadata if the backend supports tools.
     */
    fun streamResponse(
        prompt: String,
        options: GenerationOptions = GenerationOptions()
    ): Flow<ModelChunk>

    /**
     * Optional health / readiness check. Default implementation returns true.
     * Cloud backends can use this to validate the API key; on-device backends
     * can verify model weights are loaded.
     */
    suspend fun isReady(): Boolean = true

    /**
     * Release any native resources (model weights, network clients, etc.).
     * Called when the backend is swapped out or the process is backgrounded.
     */
    fun close() {}
}

/**
 * Generation parameters. Keep this data class small and serializable so it
 * can be stored per-project if needed.
 */
data class GenerationOptions(
    val temperature: Float = 0.7f,
    val maxTokens: Int = 4096,
    val stopSequences: List<String> = emptyList(),
    /** When true and [ModelBackend.supportsTools] is true, the runtime may
     *  include tool schemas in the prompt. */
    val enableTools: Boolean = true,
    /** Opaque backend-specific extras (e.g. "model" name for multi-model cloud endpoints). */
    val extras: Map<String, String> = emptyMap()
)

/**
 * Complete response from a non-streaming call.
 */
data class ModelResponse(
    val text: String,
    val toolCalls: List<ToolCall> = emptyList(),
    val finishReason: FinishReason = FinishReason.STOP,
    val usage: TokenUsage? = null
)

/**
 * One chunk of a streaming response.
 */
data class ModelChunk(
    val delta: String = "",
    val toolCalls: List<ToolCall> = emptyList(),
    val isFinal: Boolean = false,
    val finishReason: FinishReason? = null
)

data class ToolCall(
    val id: String,
    val name: String,
    val argumentsJson: String
)

enum class FinishReason {
    STOP,
    LENGTH,
    TOOL_CALLS,
    ERROR,
    CANCELLED
}

data class TokenUsage(
    val promptTokens: Int,
    val completionTokens: Int
)
