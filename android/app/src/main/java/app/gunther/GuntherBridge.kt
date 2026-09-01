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
    context: Context,
    private val webView: WebView,
) {
    private val prefs: SharedPreferences = securePrefs(context)

    @JavascriptInterface
    fun hasKey(): Boolean = !prefs.getString(KEY, "").isNullOrBlank()

    @JavascriptInterface
    fun setApiKey(key: String) {
        prefs.edit().putString(KEY, key.trim()).apply()
    }

    @JavascriptInterface
    fun clearApiKey() {
        prefs.edit().remove(KEY).apply()
    }

    @JavascriptInterface
    fun complete(requestId: String, payloadJson: String) {
        thread(name = "gunther-xai") {
            val result = runCatching { post(payloadJson) }.getOrElse { err ->
                JSONObject()
                    .put("status", 0)
                    .put("error", err.message ?: "Network error")
                    .toString()
            }
            webView.post {
                val script =
                    "window.__guntherNativeDone && window.__guntherNativeDone(${JSONObject.quote(requestId)}, $result);"
                webView.evaluateJavascript(script, null)
            }
        }
    }

    private fun post(payloadJson: String): String {
        val apiKey = prefs.getString(KEY, "").orEmpty()
        if (apiKey.isBlank()) {
            return JSONObject()
                .put("status", 401)
                .put("error", "Add your xAI API key in Settings.")
                .toString()
        }
        val conn = (URL("https://api.x.ai/v1/chat/completions").openConnection() as HttpURLConnection)
        conn.requestMethod = "POST"
        conn.connectTimeout = 20000
        conn.readTimeout = 55000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Authorization", "Bearer $apiKey")
        conn.outputStream.use { it.write(payloadJson.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
        conn.disconnect()
        val json = JSONObject().put("status", code)
        if (body.isNotBlank()) {
            try {
                json.put("json", JSONObject(body))
            } catch (_: Exception) {
                json.put("body", body.take(400))
            }
        }
        if (code !in 200..299) {
            json.put("error", "xAI API error $code")
        }
        return json.toString()
    }

    companion object {
        private const val KEY = "xai_api_key"

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
