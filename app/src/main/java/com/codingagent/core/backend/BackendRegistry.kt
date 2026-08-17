package com.codingagent.core.backend

import android.content.Context
import com.codingagent.core.config.KeystoreHelper
import java.util.concurrent.ConcurrentHashMap

/**
 * Central registry of available ModelBackend implementations.
 *
 * Backends are registered by id. The registry is responsible for:
 * - Instantiating the concrete class from a BackendConfig
 * - Injecting secrets from Keystore when needed
 * - Caching live instances so we don't re-create network clients / model loaders
 *   on every turn
 *
 * Adding a third backend = implement ModelBackend + register a factory here.
 * No other modules need to change.
 */
class BackendRegistry(
    private val context: Context,
    private val keystoreHelper: KeystoreHelper
) {

    private val factories = ConcurrentHashMap<String, BackendFactory>()
    private val liveInstances = ConcurrentHashMap<String, ModelBackend>()

    init {
        // Built-in backends. Third-party / future backends register themselves
        // via registerFactory() from Application.onCreate or a plugin loader.
        registerFactory(CloudBackend.ID) { config ->
            CloudBackend(
                config = config,
                apiKeyProvider = { alias ->
                    alias?.let { keystoreHelper.getSecret(it) }
                }
            )
        }
        registerFactory(OnDeviceBackend.ID) { config ->
            OnDeviceBackend(config)
        }
    }

    fun registerFactory(id: String, factory: BackendFactory) {
        factories[id] = factory
    }

    fun availableBackendIds(): Set<String> = factories.keys.toSet()

    fun displayNameFor(id: String): String {
        // Cheap way to get a display name without fully constructing the backend.
        return when (id) {
            CloudBackend.ID -> CloudBackend.DISPLAY_NAME
            OnDeviceBackend.ID -> OnDeviceBackend.DISPLAY_NAME
            else -> id
        }
    }

    /**
     * Returns a live ModelBackend for the given config.
     * Creates and caches if necessary. Throws if the backend id is unknown
     * or if required secrets cannot be resolved.
     */
    fun getOrCreate(config: BackendConfig): ModelBackend {
        val cacheKey = cacheKey(config)
        return liveInstances.getOrPut(cacheKey) {
            val factory = factories[config.backendId]
                ?: throw IllegalArgumentException("Unknown backend id: ${config.backendId}")
            factory.create(config)
        }
    }

    fun release(config: BackendConfig) {
        val key = cacheKey(config)
        liveInstances.remove(key)?.close()
    }

    fun releaseAll() {
        liveInstances.values.forEach { it.close() }
        liveInstances.clear()
    }

    private fun cacheKey(config: BackendConfig): String {
        return listOf(
            config.backendId,
            config.modelName.orEmpty(),
            config.baseUrl.orEmpty(),
            config.keystoreAlias.orEmpty()
        ).joinToString("|")
    }
}

fun interface BackendFactory {
    fun create(config: BackendConfig): ModelBackend
}
