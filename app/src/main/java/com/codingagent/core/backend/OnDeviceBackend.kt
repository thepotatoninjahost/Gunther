package com.codingagent.core.backend

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * On-device backend stub.
 *
 * Intended future path: load a GGUF / NNAPI / MediaPipe / ExecuTorch model
 * from app-private storage or a user-selected directory, then run inference
 * entirely offline.
 *
 * The stub returns deterministic text so the agent runtime can be exercised
 * without shipping multi-hundred-MB weights. When a real runtime is wired,
 * keep the same ModelBackend surface — only this class changes.
 */
class OnDeviceBackend(
    private val config: BackendConfig
) : ModelBackend {

    override val id: String = ID
    override val displayName: String = DISPLAY_NAME
    override val isOnDevice: Boolean = true

    // In a real implementation this would be the loaded model handle / session.
    private var modelLoaded: Boolean = false

    init {
        // Simulate "weights present" based on a config flag or file existence.
        // For the stub we always claim ready after a short delay on first use.
        modelLoaded = true
    }

    override fun supportsTools(): Boolean {
        // Many small on-device models do not reliably do tool calling.
        // Expose the capability explicitly so the runtime can adapt.
        return config.extras["supports_tools"]?.toBoolean() == true
    }

    override suspend fun isReady(): Boolean = modelLoaded

    override suspend fun sendPrompt(
        prompt: String,
        options: GenerationOptions
    ): ModelResponse {
        delay(200) // simulate local inference latency
        val text = buildStubReply(prompt, options)
        return ModelResponse(
            text = text,
            finishReason = FinishReason.STOP,
            usage = TokenUsage(
                promptTokens = prompt.length / 4,
                completionTokens = text.length / 4
            )
        )
    }

    override fun streamResponse(
        prompt: String,
        options: GenerationOptions
    ): Flow<ModelChunk> = flow {
        val full = buildStubReply(prompt, options)
        val chunkSize = 12
        var i = 0
        while (i < full.length) {
            val end = minOf(i + chunkSize, full.length)
            emit(ModelChunk(delta = full.substring(i, end)))
            i = end
            delay(20)
        }
        emit(
            ModelChunk(
                delta = "",
                isFinal = true,
                finishReason = FinishReason.STOP
            )
        )
    }

    override fun close() {
        // Real implementation: release native model / NNAPI session.
        modelLoaded = false
    }

    private fun buildStubReply(prompt: String, options: GenerationOptions): String {
        val model = config.modelName ?: "on-device-stub"
        return buildString {
            appendLine("[OnDeviceBackend:$model] offline inference stub.")
            appendLine("Prompt length: ${prompt.length} chars.")
            appendLine()
            appendLine("No real weights are loaded. Wire a GGUF / NNAPI /")
            appendLine("ExecuTorch runtime here; keep the ModelBackend contract.")
            if (!supportsTools()) {
                appendLine()
                appendLine("(tools disabled for this on-device profile)")
            }
        }.trim()
    }

    companion object {
        const val ID = "on-device"
        const val DISPLAY_NAME = "On-device (stub)"
    }
}
