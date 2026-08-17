package com.codingagent.core.backend

/**
 * Serializable configuration for a registered backend instance.
 * Stored per-project or as a global default in AppSettings.
 *
 * Secrets (API keys) are never stored here — only a Keystore alias.
 */
data class BackendConfig(
    val backendId: String,
    /** Keystore alias that holds the API key / token for this backend, if any. */
    val keystoreAlias: String? = null,
    /** Optional model name / variant (e.g. "grok-4", "local-7b-q4"). */
    val modelName: String? = null,
    /** Base URL for cloud endpoints; ignored by on-device backends. */
    val baseUrl: String? = null,
    /** Extra opaque parameters the concrete backend may understand. */
    val extras: Map<String, String> = emptyMap()
)
