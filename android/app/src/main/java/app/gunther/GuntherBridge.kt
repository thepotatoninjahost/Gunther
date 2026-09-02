package app.gunther

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class GuntherBridge(
    private val activity: MainActivity,
    private val webView: WebView,
) {
    private val prefs: SharedPreferences = securePrefs(activity)

    @JavascriptInterface
    fun hasKey(): Boolean = !prefs.getString(KEY, "").isNullOrBlank()

    @JavascriptInterface
    fun getModel(): String = prefs.getString(MODEL, DEFAULT_MODEL).orEmpty()

    @JavascriptInterface
    fun getEndpoint(): String = prefs.getString(ENDPOINT, DEFAULT_ENDPOINT).orEmpty()

    @JavascriptInterface
    fun setGateway(endpoint: String, model: String) {
        prefs.edit()
            .putString(ENDPOINT, endpoint.trim())
            .putString(MODEL, model.trim())
            .commit()
    }

    @JavascriptInterface
    fun setApiKey(key: String) {
        val trimmed = key.trim().removePrefix("Bearer ").trim().trim('"')
        if (trimmed.isBlank()) return
        prefs.edit().putString(KEY, trimmed).commit()
        activity.runOnUiThread {
            android.widget.Toast.makeText(activity, "Key saved", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun clearApiKey() {
        prefs.edit().remove(KEY).commit()
    }

    @JavascriptInterface
    fun complete(requestId: String, payloadJson: String) {
        thread(name = "gunther-llm") {
            val result = runCatching { post(payloadJson) }.getOrElse { err ->
                JSONObject()
                    .put("status", 0)
                    .put("error", err.message ?: "Network error")
                    .toString()
            }
            webView.post {
                val script =
                    "window.__guntherNativeDone && window.__guntherNativeDone(${JSONObject.quote(requestId)}, JSON.parse(${JSONObject.quote(result)}));"
                webView.evaluateJavascript(script, null)
            }
        }
    }

    private fun post(payloadJson: String): String {
        val apiKey = prefs.getString(KEY, "").orEmpty().trim().removePrefix("Bearer ").trim()
        if (apiKey.isBlank()) {
            return JSONObject()
                .put("status", 401)
                .put("error", "Paste a Groq key in Settings. Free, no card: console.groq.com/keys")
                .toString()
        }
        val endpoint = prefs.getString(ENDPOINT, DEFAULT_ENDPOINT).orEmpty().ifBlank { DEFAULT_ENDPOINT }
        val model = prefs.getString(MODEL, DEFAULT_MODEL).orEmpty().ifBlank { DEFAULT_MODEL }
        val bodyObj = JSONObject(payloadJson)
        bodyObj.put("model", model)
        val bytes = bodyObj.toString().toByteArray(Charsets.UTF_8)
        val conn = (URL(endpoint).openConnection() as HttpURLConnection)
        conn.requestMethod = "POST"
        conn.connectTimeout = 20000
        conn.readTimeout = 55000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("User-Agent", "Gunther/1.5")
        conn.setRequestProperty("Authorization", "Bearer $apiKey")
        conn.outputStream.use { it.write(bytes) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val raw = stream?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
        conn.disconnect()
        val json = JSONObject().put("status", code)
        var detail = "API error $code"
        if (raw.isNotBlank()) {
            try {
                val parsed = JSONObject(raw)
                json.put("json", parsed)
                val err = parsed.optJSONObject("error")
                val msg = when {
                    err == null -> parsed.optString("error")
                    else -> err.optString("message").ifBlank { err.toString() }
                }
                if (msg.isNotBlank()) detail = msg
            } catch (_: Exception) {
                json.put("body", raw.take(400))
                detail = raw.take(180)
            }
        }
        if (code !in 200..299) json.put("error", detail)
        return json.toString()
    }

    companion object {
        private const val KEY = "xai_api_key"
        private const val MODEL = "model_id"
        private const val ENDPOINT = "endpoint"
        const val DEFAULT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
        const val DEFAULT_MODEL = "qwen/qwen3-32b"

        @SuppressLint("ApplySharedPref")
        private fun securePrefs(context: Context): SharedPreferences {
            return try {
                val master = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                EncryptedSharedPreferences.create(
                    "gunther_secure",
                    master,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
                )
            } catch (_: Exception) {
                context.getSharedPreferences("gunther_secure", Context.MODE_PRIVATE)
            }
        }
    }
}
