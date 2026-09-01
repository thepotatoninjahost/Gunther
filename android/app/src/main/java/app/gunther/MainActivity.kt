package app.gunther

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import java.io.ByteArrayInputStream

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0C0B"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.setSupportZoom(false)
            settings.displayZoomControls = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.textZoom = 100
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            isFocusable = true
            isFocusableInTouchMode = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? {
                    val url = request.url ?: return null
                    if (url.host != "app.gunther") return null
                    var path = url.path.orEmpty().trimStart('/')
                    if (path.isEmpty() || path.endsWith("/")) path += "index.html"
                    if (!path.startsWith("www/")) path = "www/$path"
                    path = path.substringBefore("?")
                    return serveAsset(path)
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (!request.isForMainFrame) return
                    val message = error.description?.toString() ?: "Unknown error"
                    view.loadDataWithBaseURL(
                        null,
                        errorHtml(message),
                        "text/html",
                        "utf-8",
                        null,
                    )
                }
            }
            loadUrl("https://app.gunther/www/index.html")
        }
        setContentView(webView)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            },
        )
    }

    private fun serveAsset(path: String): WebResourceResponse {
        return try {
            val stream = assets.open(path)
            val mime = mimeType(path)
            WebResourceResponse(
                mime,
                "utf-8",
                200,
                "OK",
                mapOf(
                    "Access-Control-Allow-Origin" to "*",
                    "Content-Type" to "$mime; charset=utf-8",
                    "Cache-Control" to "no-store",
                ),
                stream,
            )
        } catch (_: Exception) {
            WebResourceResponse(
                "text/plain",
                "utf-8",
                404,
                "Not Found",
                mapOf("Access-Control-Allow-Origin" to "*"),
                ByteArrayInputStream(ByteArray(0)),
            )
        }
    }

    private fun mimeType(path: String): String {
        val lower = path.lowercase()
        return when {
            lower.endsWith(".html") -> "text/html"
            lower.endsWith(".js") -> "text/javascript"
            lower.endsWith(".css") -> "text/css"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".json") -> "application/json"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".woff2") -> "font/woff2"
            else -> "application/octet-stream"
        }
    }

    private fun errorHtml(message: String): String {
        val safe = message.replace("<", "<")
        return """
            <html><body style="background:#0B0C0B;color:#3DFF6B;font-family:sans-serif;padding:24px">
            <h2>Gunther could not load</h2>
            <p>$safe</p>
            </body></html>
        """.trimIndent()
    }
}
