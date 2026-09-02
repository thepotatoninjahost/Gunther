package app.gunther

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import kotlin.concurrent.thread

class GuntherFiles(
    private val activity: MainActivity,
    private val webView: WebView,
) {
    @JavascriptInterface
    fun pickFolder() {
        activity.runOnUiThread { activity.openFolderPicker() }
    }

    @JavascriptInterface
    fun pickFiles() {
        activity.runOnUiThread { activity.openFilePicker() }
    }

    @JavascriptInterface
    fun writeFile(path: String, content: String): String {
        return Disk.writeFile(activity, path, content).toString()
    }

    @JavascriptInterface
    fun deleteFile(path: String): String {
        return Disk.deleteFile(activity, path).toString()
    }

    @JavascriptInterface
    fun hasDisk(): Boolean = Disk.workspaceDir(activity).exists()

    @JavascriptInterface
    fun runShell(requestId: String, command: String) {
        thread(name = "gunther-sh") {
            val result = Disk.runShell(activity, command).toString()
            done(requestId, result)
        }
    }

    @JavascriptInterface
    fun searchWeb(requestId: String, query: String) {
        thread(name = "gunther-web") {
            val result = Disk.searchWeb(query).toString()
            done(requestId, result)
        }
    }

    @JavascriptInterface
    fun verify(requestId: String) {
        thread(name = "gunther-verify") {
            val result = Disk.verify(activity).toString()
            done(requestId, result)
        }
    }

    private fun done(requestId: String, json: String) {
        webView.post {
            val script =
                "window.__guntherFilesDone && window.__guntherFilesDone(${JSONObject.quote(requestId)}, JSON.parse(${JSONObject.quote(json)}));"
            webView.evaluateJavascript(script, null)
        }
    }
}
