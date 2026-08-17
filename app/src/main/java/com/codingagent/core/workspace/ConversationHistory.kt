package com.codingagent.core.workspace

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Ordered conversation turns for one project.
 * Persisted as JSON under the project's private directory (or a dedicated
 * history folder) so each project keeps its own context.
 */
data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: Role,
    val content: String,
    val timestampMs: Long = System.currentTimeMillis(),
    /** Optional tool-call payload when role == ASSISTANT and tools were used. */
    val toolCallsJson: String? = null
) {
    enum class Role { SYSTEM, USER, ASSISTANT, TOOL }
}

class ConversationHistory(
    private val messages: MutableList<ChatMessage> = mutableListOf()
) {
    fun messages(): List<ChatMessage> = messages.toList()

    fun add(message: ChatMessage) {
        messages.add(message)
    }

    fun addUser(text: String) {
        messages.add(ChatMessage(role = ChatMessage.Role.USER, content = text))
    }

    fun addAssistant(text: String, toolCallsJson: String? = null) {
        messages.add(
            ChatMessage(
                role = ChatMessage.Role.ASSISTANT,
                content = text,
                toolCallsJson = toolCallsJson
            )
        )
    }

    fun clear() {
        messages.clear()
    }

    /**
     * Build a plain-text prompt fragment from history for backends that only
     * accept a single string. Real production code may switch to structured
     * chat messages when the backend supports them.
     */
    fun toPromptFragment(maxMessages: Int = 40): String {
        val slice = messages.takeLast(maxMessages)
        return slice.joinToString("\n\n") { msg ->
            val label = when (msg.role) {
                ChatMessage.Role.SYSTEM -> "System"
                ChatMessage.Role.USER -> "User"
                ChatMessage.Role.ASSISTANT -> "Assistant"
                ChatMessage.Role.TOOL -> "Tool"
            }
            "$label: ${msg.content}"
        }
    }

    fun toJson(): String {
        val arr = JSONArray()
        messages.forEach { m ->
            val obj = JSONObject()
            obj.put("id", m.id)
            obj.put("role", m.role.name)
            obj.put("content", m.content)
            obj.put("timestampMs", m.timestampMs)
            if (m.toolCallsJson != null) obj.put("toolCallsJson", m.toolCallsJson)
            arr.put(obj)
        }
        return arr.toString()
    }

    companion object {
        fun fromJson(raw: String): ConversationHistory {
            val arr = JSONArray(raw)
            val list = mutableListOf<ChatMessage>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(
                    ChatMessage(
                        id = obj.getString("id"),
                        role = ChatMessage.Role.valueOf(obj.getString("role")),
                        content = obj.getString("content"),
                        timestampMs = obj.optLong("timestampMs", 0L),
                        toolCallsJson = obj.optString("toolCallsJson", null)
                            .takeIf { !it.isNullOrEmpty() }
                    )
                )
            }
            return ConversationHistory(list)
        }
    }
}

/**
 * Persistence for conversation histories. One JSON file per project.
 */
class ConversationHistoryStore(private val context: Context) {

    private val root = File(context.filesDir, "history").also { it.mkdirs() }

    fun loadOrCreate(projectId: String): ConversationHistory {
        val file = fileFor(projectId)
        if (!file.exists()) return ConversationHistory()
        return try {
            ConversationHistory.fromJson(file.readText())
        } catch (_: Exception) {
            ConversationHistory()
        }
    }

    fun save(projectId: String, history: ConversationHistory) {
        fileFor(projectId).writeText(history.toJson())
    }

    private fun fileFor(projectId: String) = File(root, "$projectId.json")
}
