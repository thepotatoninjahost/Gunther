package com.codingagent.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.codingagent.core.agent.AgentEvent
import com.codingagent.core.agent.AgentRuntime
import com.codingagent.core.backend.GenerationOptions
import com.codingagent.core.backend.ModelBackend
import com.codingagent.core.workspace.ChatMessage
import com.codingagent.core.workspace.ConversationHistory
import com.codingagent.ui.session.SessionState
import com.codingagent.ui.session.SessionStatePanel
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

/**
 * Phone-first chat surface wired to [AgentRuntime].
 *
 * - Voice-to-text cleanup before the model (see [VoiceInputCleaner]).
 * - Long assistant turns are collapsible.
 * - Tool activity is shown as TOOL role bubbles and a short status line.
 * - Diff view for file edits belongs in a separate FileDiffScreen.
 */
@Composable
fun ChatScreen(
    history: ConversationHistory,
    backend: ModelBackend?,
    agentRuntime: AgentRuntime,
    sessionState: SessionState,
    systemPrompt: String,
    onOpenSettings: () -> Unit,
    onHistoryChanged: () -> Unit
) {
    var input by remember { mutableStateOf("") }
    var streamingText by remember { mutableStateOf<String?>(null) }
    var statusLine by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val messages = history.messages()

    LaunchedEffect(messages.size, streamingText) {
        val extra = if (streamingText != null) 1 else 0
        listState.animateScrollToItem((messages.size + extra).coerceAtLeast(0))
    }

    Column(modifier = Modifier.fillMaxSize().padding(8.dp)) {
        SessionStatePanel(state = sessionState, modifier = Modifier.padding(bottom = 8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            Button(onClick = onOpenSettings) { Text("Settings") }
        }

        statusLine?.let { line ->
            Text(
                line,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(messages, key = { it.id }) { msg ->
                MessageBubble(msg)
            }
            streamingText?.let { partial ->
                item {
                    MessageBubble(
                        ChatMessage(
                            role = ChatMessage.Role.ASSISTANT,
                            content = partial
                        ),
                        isStreaming = true
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                enabled = !busy,
                label = { Text("Message") }
            )
            Button(
                onClick = {
                    val text = VoiceInputCleaner.clean(input.trim())
                    if (text.isBlank() || backend == null) return@Button
                    input = ""
                    busy = true
                    streamingText = ""
                    statusLine = "Thinking…"
                    scope.launch {
                        agentRuntime
                            .runTurn(
                                userMessage = text,
                                systemPrompt = systemPrompt,
                                history = history,
                                backend = backend,
                                options = GenerationOptions(enableTools = true),
                                recordUserMessage = true
                            )
                            .catch { e ->
                                statusLine = "Error: ${e.message}"
                                streamingText = null
                                busy = false
                                onHistoryChanged()
                            }
                            .collect { event ->
                                when (event) {
                                    is AgentEvent.UserMessageRecorded -> {
                                        onHistoryChanged()
                                    }
                                    is AgentEvent.ModelStarted -> {
                                        statusLine = if (event.round == 0) {
                                            "Model (tools=${event.toolsEnabled})…"
                                        } else {
                                            "Model round ${event.round + 1}…"
                                        }
                                        streamingText = ""
                                    }
                                    is AgentEvent.AssistantDelta -> {
                                        streamingText = event.textSoFar
                                    }
                                    is AgentEvent.AssistantFinal -> {
                                        streamingText = null
                                        onHistoryChanged()
                                        if (event.toolCalls.isNotEmpty()) {
                                            statusLine = "Calling ${event.toolCalls.size} tool(s)…"
                                        }
                                    }
                                    is AgentEvent.ToolsStarted -> {
                                        statusLine = "Running: " +
                                            event.calls.joinToString { it.name }
                                    }
                                    is AgentEvent.ToolFinished -> {
                                        val tag = if (event.success) "ok" else "fail"
                                        statusLine =
                                            "${event.call.name} $tag (${event.durationMs}ms)"
                                        onHistoryChanged()
                                    }
                                    is AgentEvent.ToolsRoundComplete -> {
                                        statusLine = "Tools done ($event.count). Continuing…"
                                    }
                                    is AgentEvent.TurnFinished -> {
                                        statusLine = null
                                        streamingText = null
                                        busy = false
                                        onHistoryChanged()
                                    }
                                }
                            }
                    }
                },
                enabled = !busy && backend != null
            ) {
                Text(if (busy) "…" else "Send")
            }
        }
    }
}

@Composable
private fun MessageBubble(msg: ChatMessage, isStreaming: Boolean = false) {
    var expanded by remember { mutableStateOf(true) }
    val long = msg.content.length > 800
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                when (msg.role) {
                    ChatMessage.Role.USER -> "You"
                    ChatMessage.Role.ASSISTANT ->
                        if (isStreaming) "Assistant (streaming)" else "Assistant"
                    ChatMessage.Role.SYSTEM -> "System"
                    ChatMessage.Role.TOOL -> "Tool"
                },
                style = MaterialTheme.typography.labelMedium,
                color = when (msg.role) {
                    ChatMessage.Role.TOOL -> MaterialTheme.colorScheme.tertiary
                    else -> MaterialTheme.colorScheme.onSurface
                }
            )
            val body = if (long && !expanded) {
                msg.content.take(600) + "…"
            } else {
                msg.content
            }
            Text(body, style = MaterialTheme.typography.bodyMedium)
            if (long) {
                Button(onClick = { expanded = !expanded }) {
                    Text(if (expanded) "Collapse" else "Expand")
                }
            }
        }
    }
}

/**
 * Cleanup pass for mobile dictation noise: collapse repeated phrases and
 * strip common filler. Apply before the text hits the model.
 */
object VoiceInputCleaner {
    private val filler = Regex(
        """\b(um+|uh+|like|you know|basically|actually)\b[,.]?\s*""",
        RegexOption.IGNORE_CASE
    )

    fun clean(raw: String): String {
        if (raw.isBlank()) return raw
        val parts = raw.split(Regex("(?<=[.!?])\\s+"))
        val deduped = mutableListOf<String>()
        for (p in parts) {
            val t = p.trim()
            if (t.isEmpty()) continue
            if (deduped.isEmpty() || !deduped.last().equals(t, ignoreCase = true)) {
                deduped.add(t)
            }
        }
        var result = deduped.joinToString(" ")
        result = filler.replace(result, "")
        return result.replace(Regex("\\s{2,}"), " ").trim()
    }
}
