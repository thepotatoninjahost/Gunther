package com.codingagent.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.DropdownMenu
// ExposedDropdownMenu is an extension on ExposedDropdownMenuBox scope in Material3
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.codingagent.core.backend.BackendConfig
import com.codingagent.core.backend.CloudBackend
import com.codingagent.core.backend.OnDeviceBackend
import com.codingagent.core.config.AppSettings
import com.codingagent.core.config.KeystoreHelper

/**
 * Settings UI for backend selection and API key entry.
 *
 * Keys are written only through KeystoreHelper. The screen never persists
 * plaintext secrets in SharedPreferences or ViewModel state beyond the
 * transient text field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    keystoreHelper: KeystoreHelper,
    projectId: String,
    onBack: () -> Unit
) {
    val initial = remember(projectId) { settings.getBackendConfig(projectId) }

    var backendId by remember { mutableStateOf(initial.backendId) }
    var modelName by remember { mutableStateOf(initial.modelName.orEmpty()) }
    var baseUrl by remember { mutableStateOf(initial.baseUrl.orEmpty()) }
    var apiKeyInput by remember { mutableStateOf("") }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var expanded by remember { mutableStateOf(false) }

    val options = AppSettings.BUILTIN_BACKEND_OPTIONS
    val selectedLabel = options.firstOrNull { it.first == backendId }?.second ?: backendId

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Backend & keys") },
                navigationIcon = {
                    Button(onClick = onBack) { Text("Back") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Active project: $projectId",
                style = MaterialTheme.typography.labelMedium
            )

            // Backend picker
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = !expanded }
            ) {
                OutlinedTextField(
                    value = selectedLabel,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Backend") },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                    },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    options.forEach { (id, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = {
                                backendId = id
                                expanded = false
                            }
                        )
                    }
                }
            }

            OutlinedTextField(
                value = modelName,
                onValueChange = { modelName = it },
                label = { Text("Model name (optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            if (backendId == CloudBackend.ID) {
                OutlinedTextField(
                    value = baseUrl,
                    onValueChange = { baseUrl = it },
                    label = { Text("Base URL (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                val alias = initial.keystoreAlias ?: "cloud_api_key"
                val hasKey = keystoreHelper.hasSecret(alias)
                Text(
                    if (hasKey) "API key: stored in Keystore (alias=$alias)"
                    else "API key: not set",
                    style = MaterialTheme.typography.bodySmall
                )

                OutlinedTextField(
                    value = apiKeyInput,
                    onValueChange = { apiKeyInput = it },
                    label = { Text("New API key") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }

            if (backendId == OnDeviceBackend.ID) {
                Text(
                    "On-device backend uses no API key. Model weights are loaded " +
                        "from app storage when a real runtime is wired.",
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Button(
                    onClick = {
                        val alias = initial.keystoreAlias ?: "cloud_api_key"
                        if (apiKeyInput.isNotBlank()) {
                            keystoreHelper.storeSecret(alias, apiKeyInput.trim())
                            apiKeyInput = ""
                        }
                        val config = BackendConfig(
                            backendId = backendId,
                            keystoreAlias = if (backendId == CloudBackend.ID) alias else null,
                            modelName = modelName.ifBlank { null },
                            baseUrl = baseUrl.ifBlank { null }
                        )
                        settings.setBackendConfig(projectId, config)
                        statusMessage = "Saved for project $projectId"
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Save")
                }
                Button(
                    onClick = {
                        val alias = initial.keystoreAlias ?: "cloud_api_key"
                        keystoreHelper.deleteSecret(alias)
                        statusMessage = "Key deleted"
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Clear key")
                }
            }

            statusMessage?.let {
                Spacer(Modifier.height(8.dp))
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        it,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            Text(
                "Keys are stored only in Android Keystore. They never appear " +
                    "in source control or plaintext SharedPreferences.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
