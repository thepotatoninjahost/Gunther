package com.codingagent.core.config

import android.content.Context
import com.codingagent.core.backend.BackendConfig
import com.codingagent.core.backend.CloudBackend
import com.codingagent.core.backend.OnDeviceBackend
import org.json.JSONObject

/**
 * Global + per-project settings.
 *
 * Active backend selection is stored per project so the same device can
 * point different workspaces at different models (cloud for one repo,
 * on-device for another).
 *
 * API keys themselves live only in KeystoreHelper; this class stores only
 * the alias and non-secret config.
 */
class AppSettings(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var activeProjectId: String?
        get() = prefs.getString(KEY_ACTIVE_PROJECT, null)
        set(value) = prefs.edit().putString(KEY_ACTIVE_PROJECT, value).apply()

    fun getBackendConfig(projectId: String): BackendConfig {
        val raw = prefs.getString(backendKey(projectId), null)
        return if (raw != null) {
            decodeBackendConfig(raw)
        } else {
            // Default: cloud stub, no key yet.
            BackendConfig(
                backendId = CloudBackend.ID,
                keystoreAlias = "cloud_api_key",
                modelName = null,
                baseUrl = null
            )
        }
    }

    fun setBackendConfig(projectId: String, config: BackendConfig) {
        prefs.edit()
            .putString(backendKey(projectId), encodeBackendConfig(config))
            .apply()
    }

    fun getDefaultBackendConfig(): BackendConfig =
        getBackendConfig(GLOBAL_DEFAULT)

    fun setDefaultBackendConfig(config: BackendConfig) {
        setBackendConfig(GLOBAL_DEFAULT, config)
    }

    /** List of known project ids that have any stored state. */
    fun knownProjectIds(): List<String> {
        return prefs.all.keys
            .filter { it.startsWith(PREFIX_BACKEND) }
            .map { it.removePrefix(PREFIX_BACKEND) }
            .filter { it != GLOBAL_DEFAULT }
            .distinct()
    }

    private fun backendKey(projectId: String) = "$PREFIX_BACKEND$projectId"

    private fun encodeBackendConfig(config: BackendConfig): String {
        val json = JSONObject()
        json.put("backendId", config.backendId)
        json.put("keystoreAlias", config.keystoreAlias)
        json.put("modelName", config.modelName)
        json.put("baseUrl", config.baseUrl)
        val extras = JSONObject()
        config.extras.forEach { (k, v) -> extras.put(k, v) }
        json.put("extras", extras)
        return json.toString()
    }

    private fun decodeBackendConfig(raw: String): BackendConfig {
        val json = JSONObject(raw)
        val extrasJson = json.optJSONObject("extras") ?: JSONObject()
        val extras = mutableMapOf<String, String>()
        extrasJson.keys().forEach { key ->
            extras[key] = extrasJson.getString(key)
        }
        return BackendConfig(
            backendId = json.getString("backendId"),
            keystoreAlias = json.optString("keystoreAlias", null).takeIf { !it.isNullOrEmpty() },
            modelName = json.optString("modelName", null).takeIf { !it.isNullOrEmpty() },
            baseUrl = json.optString("baseUrl", null).takeIf { !it.isNullOrEmpty() },
            extras = extras
        )
    }

    companion object {
        private const val PREFS_NAME = "coding_agent_settings"
        private const val KEY_ACTIVE_PROJECT = "active_project_id"
        private const val PREFIX_BACKEND = "backend_config_"
        const val GLOBAL_DEFAULT = "__global__"

        /** Convenience list for the settings UI. */
        val BUILTIN_BACKEND_OPTIONS = listOf(
            CloudBackend.ID to CloudBackend.DISPLAY_NAME,
            OnDeviceBackend.ID to OnDeviceBackend.DISPLAY_NAME
        )
    }
}
