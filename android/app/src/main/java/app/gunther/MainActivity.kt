package app.gunther

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject
import java.io.ByteArrayInputStream
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var htmlFileCallback: ValueCallback<Array<Uri>>? = null

    private val filePicker =
        registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            val callback = htmlFileCallback
            htmlFileCallback = null
            if (callback != null) {
                callback.onReceiveValue(if (uris.isNullOrEmpty()) null else uris.toTypedArray())
                return@registerForActivityResult
            }
            if (uris.isNullOrEmpty()) {
                toast("No files selected")
                return@registerForActivityResult
            }
            thread { pushUris(uris) }
        }

    private val folderPicker =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            if (uri == null) {
                toast("No folder selected")
                return@registerForActivityResult
            }
            Disk.saveTree(this, uri)
            thread { pushTree(uri) }
        }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
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
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams,
                ): Boolean {
                    htmlFileCallback?.onReceiveValue(null)
                    htmlFileCallback = filePathCallback
                    filePicker.launch(arrayOf("*/*"))
                    return true
                }
            }
            addJavascriptInterface(GuntherBridge(this@MainActivity, this), "GuntherNative")
            addJavascriptInterface(GuntherFiles(this@MainActivity, this), "GuntherFiles")
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

    fun openFolderPicker() {
        toast("Select a folder")
        folderPicker.launch(null)
    }

    fun openFilePicker() {
        filePicker.launch(arrayOf("*/*"))
    }

    private fun pushTree(uri: Uri) {
        val (name, files) = ProjectImport.fromTree(this, uri)
        Disk.materialize(this, files)
        deliver(name, files)
    }

    private fun pushUris(uris: List<Uri>) {
        val files = ProjectImport.fromUris(this, uris)
        Disk.materialize(this, files)
        deliver("imported", files)
    }

    private fun deliver(name: String, files: JSONObject) {
        val count = files.length()
        runOnUiThread {
            if (count == 0) {
                toast("No text files in that pick")
                return@runOnUiThread
            }
            toast("Imported $count file(s)")
            val script =
                "window.__guntherImport && window.__guntherImport(${JSONObject.quote(name)}, $files);"
            webView.evaluateJavascript(script, null)
        }
    }

    private fun toast(message: String) {
        runOnUiThread { Toast.makeText(this, message, Toast.LENGTH_SHORT).show() }
    }

    private fun serveAsset(path: String): WebResourceResponse {
        return try {
            val bytes = assets.open(path).use { it.readBytes() }
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
                ByteArrayInputStream(bytes),
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
