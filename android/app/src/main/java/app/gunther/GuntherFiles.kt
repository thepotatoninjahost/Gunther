package app.gunther

import android.webkit.JavascriptInterface

class GuntherFiles(private val activity: MainActivity) {
    @JavascriptInterface
    fun pickFolder() {
        activity.runOnUiThread { activity.openFolderPicker() }
    }

    @JavascriptInterface
    fun pickFiles() {
        activity.runOnUiThread { activity.openFilePicker() }
    }
}
