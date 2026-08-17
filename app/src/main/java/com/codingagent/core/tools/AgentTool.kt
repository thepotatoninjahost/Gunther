package com.codingagent.core.tools

/**
 * First-class tool contract exposed to the agent runtime.
 *
 * Tools are not string-parsing hacks; the runtime registers them, serializes
 * their schemas into the prompt (when the backend supports tools), and
 * dispatches structured calls.
 */
interface AgentTool {
    val name: String
    val description: String
    /** JSON Schema (draft-07 style) for the arguments object. */
    val parametersSchemaJson: String

    suspend fun invoke(argumentsJson: String): ToolResult
}

data class ToolResult(
    val success: Boolean,
    val output: String,
    val error: String? = null
)

/**
 * Simple registry the agent runtime consults before each turn.
 */
class ToolRegistry {
    private val tools = linkedMapOf<String, AgentTool>()

    fun register(tool: AgentTool) {
        tools[tool.name] = tool
    }

    fun get(name: String): AgentTool? = tools[name]

    fun all(): List<AgentTool> = tools.values.toList()

    fun schemasForPrompt(): String {
        // Compact description the runtime can inject when enableTools=true.
        return tools.values.joinToString("\n") { t ->
            "- ${t.name}: ${t.description}\n  schema: ${t.parametersSchemaJson}"
        }
    }
}
