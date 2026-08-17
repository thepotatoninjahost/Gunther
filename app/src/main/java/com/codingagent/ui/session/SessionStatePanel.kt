package com.codingagent.ui.session

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Persistent session-state strip shown while coding.
 * Displays active project, backend, files touched, and unresolved risks.
 */
data class SessionState(
    val projectName: String,
    val backendDisplayName: String,
    val isOnDevice: Boolean,
    val filesTouched: List<String>,
    val unresolvedRisks: List<String>
)

@Composable
fun SessionStatePanel(
    state: SessionState,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                "Session",
                style = MaterialTheme.typography.titleSmall
            )
            Text(
                "Project: ${state.projectName}",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                "Backend: ${state.backendDisplayName}" +
                    if (state.isOnDevice) " (on-device)" else " (cloud)",
                style = MaterialTheme.typography.bodySmall
            )
            if (state.filesTouched.isNotEmpty()) {
                Text(
                    "Files touched: ${state.filesTouched.joinToString(", ")}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (state.unresolvedRisks.isNotEmpty()) {
                Text(
                    "Risks: ${state.unresolvedRisks.joinToString("; ")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}
