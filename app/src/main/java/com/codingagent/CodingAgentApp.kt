package com.codingagent

import android.app.Application
import com.codingagent.core.backend.BackendRegistry
import com.codingagent.core.config.AppSettings
import com.codingagent.core.config.KeystoreHelper
import com.codingagent.core.tools.CodeStructureChecker
import com.codingagent.core.tools.FileTool
import com.codingagent.core.tools.GitTool
import com.codingagent.core.tools.ToolRegistry
import com.codingagent.core.workspace.ConversationHistoryStore
import com.codingagent.core.workspace.ProjectManager
import com.codingagent.core.workspace.ProjectWorkspace

/**
 * Application-level wiring. Holds long-lived singletons so Activities /
 * Composables can obtain them without a DI framework in the base shell.
 *
 * Real projects may replace this with Hilt / Koin; the important part is
 * that ModelBackend instances come only from BackendRegistry.
 */
class CodingAgentApp : Application() {

    lateinit var keystoreHelper: KeystoreHelper
        private set
    lateinit var settings: AppSettings
        private set
    lateinit var backendRegistry: BackendRegistry
        private set
    lateinit var historyStore: ConversationHistoryStore
        private set
    lateinit var projectManager: ProjectManager
        private set
    lateinit var toolRegistry: ToolRegistry
        private set

    /** Currently open workspace; null until the user opens or creates a project. */
    var activeWorkspace: ProjectWorkspace? = null

    override fun onCreate() {
        super.onCreate()
        keystoreHelper = KeystoreHelper(this)
        settings = AppSettings(this)
        backendRegistry = BackendRegistry(this, keystoreHelper)
        historyStore = ConversationHistoryStore(this)
        projectManager = ProjectManager(this, historyStore)

        toolRegistry = ToolRegistry().apply {
            register(FileTool { activeWorkspace })
            register(CodeStructureChecker())
            register(GitTool { activeWorkspace })
        }
    }

    override fun onTerminate() {
        backendRegistry.releaseAll()
        projectManager.saveAll()
        super.onTerminate()
    }
}
