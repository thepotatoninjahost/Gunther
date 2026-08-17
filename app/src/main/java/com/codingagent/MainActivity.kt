package com.codingagent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.codingagent.core.agent.AgentRuntime
import com.codingagent.core.agent.RuntimePrompt
import com.codingagent.core.backend.ModelBackend
import com.codingagent.ui.chat.ChatScreen
import com.codingagent.ui.session.SessionState
import com.codingagent.ui.settings.SettingsScreen

/**
 * Single-activity host. Switches between chat and settings.
 *
 * On first launch we auto-create a default project so the agent is usable
 * without an extra setup flow.
 *
 * System prompt is built by [RuntimePrompt]. Tool turns are owned by
 * [AgentRuntime], not the composable.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as CodingAgentApp

        if (app.activeWorkspace == null) {
            val existing = app.projectManager.listProjects().firstOrNull()
            app.activeWorkspace = if (existing != null) {
                app.projectManager.openProject(existing.first)
            } else {
                app.projectManager.createProject("Default Project")
            }
            app.settings.activeProjectId = app.activeWorkspace?.projectId
        }

        val agentRuntime = AgentRuntime(app.toolRegistry)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    var showSettings by remember { mutableStateOf(false) }
                    var historyTick by remember { mutableStateOf(0) }

                    val workspace = app.activeWorkspace
                    val projectId = workspace?.projectId ?: APP_SETTINGS_FALLBACK
                    val backendConfig = app.settings.getBackendConfig(projectId)
                    val backend: ModelBackend? = try {
                        app.backendRegistry.getOrCreate(backendConfig)
                    } catch (_: Exception) {
                        null
                    }

                    val filesTouched = workspace?.filesTouchedList() ?: emptyList()
                    val sessionState = SessionState(
                        projectName = workspace?.displayName ?: "(none)",
                        backendDisplayName = backend?.displayName ?: "—",
                        isOnDevice = backend?.isOnDevice ?: false,
                        filesTouched = filesTouched,
                        unresolvedRisks = emptyList()
                    )

                    val systemPrompt = if (workspace != null) {
                        RuntimePrompt.build(
                            context = RuntimePrompt.SessionContext(
                                projectName = workspace.displayName,
                                moduleList = workspace.moduleListSummary(),
                                projectNotes = workspace.projectNotes.ifBlank { "(none)" },
                                sessionFileLog = workspace.sessionFileLog()
                            ),
                            projectOverride = workspace.systemPromptOverride
                        )
                    } else {
                        RuntimePrompt.build(
                            RuntimePrompt.SessionContext(projectName = "(none)")
                        )
                    }

                    if (showSettings) {
                        SettingsScreen(
                            settings = app.settings,
                            keystoreHelper = app.keystoreHelper,
                            projectId = projectId,
                            onBack = { showSettings = false }
                        )
                    } else if (workspace != null) {
                        @Suppress("UNUSED_EXPRESSION")
                        historyTick
                        ChatScreen(
                            history = workspace.history,
                            backend = backend,
                            agentRuntime = agentRuntime,
                            sessionState = sessionState,
                            systemPrompt = systemPrompt,
                            onOpenSettings = { showSettings = true },
                            onHistoryChanged = {
                                historyTick += 1
                                app.historyStore.save(workspace.projectId, workspace.history)
                            }
                        )
                    }
                }
            }
        }
    }

    companion object {
        private const val APP_SETTINGS_FALLBACK = "__none__"
    }
}
