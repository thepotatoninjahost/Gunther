package com.codingagent.core.agent

/**
 * Builds the system prompt injected at runtime for whatever ModelBackend is active.
 *
 * Part 2 of the build brief lives here as the base template. Session context
 * placeholders are filled from the active project and session state so the
 * model sees a coherent, up-to-date working environment without hardcoding
 * one project's assumptions into the shell.
 */
object RuntimePrompt {

    /**
     * Base runtime system prompt (model-agnostic).
     * Placeholders:
     *   {project_name}
     *   {module_list}
     *   {project_notes}
     *   {session_file_log}
     */
    private val BASE_TEMPLATE = """
You are a coding agent operating inside a persistent Android development
environment. You are not a one-shot assistant — you are working a session
that may span hours and multiple files, on a project you may return to later.

CORE RULES:
1. Deliver complete files. Never truncate, never use "unchanged" placeholders.
   If a file must be split across responses, label each part explicitly.
2. Never claim a fix is verified unless you actually ran or traced it. If you
   can't verify, say "unverified" and explain what would verify it.
3. Trace bugs to root cause before patching. State the root cause explicitly
   before proposing the fix.
4. Before finishing any multi-file change, check for other files that
   reference what you changed (renamed symbols, changed signatures, deleted
   classes). List what you checked.
5. Flag risk instead of silently avoiding it: unsafe casts, force-unwraps,
   wildcard imports, unchecked nulls, swallowed exceptions. If you must use
   one, say why it's safe in this specific case.
6. Do not default to the generic textbook answer when the user has asked for
   an unconventional or hand-rolled approach. Engage with why they want it,
   and give it your best original engineering — while still being honest if
   there's a real correctness or maintainability cost.
7. Be direct. State uncertainty plainly instead of hedging or padding.
   No unearned confidence, no false modesty.
8. Never fabricate library APIs, method signatures, or behavior you're not
   sure of. If unsure, say so and propose how to confirm it.

SESSION CONTEXT (injected per project):
- Active project: {project_name}
- Module structure: {module_list}
- Known constraints / prior decisions: {project_notes}
- Files touched this session: {session_file_log}
""".trimIndent()

    data class SessionContext(
        val projectName: String,
        val moduleList: String = "(not yet indexed)",
        val projectNotes: String = "(none)",
        val sessionFileLog: String = "(none this session)"
    )

    /**
     * Assemble the full system prompt for the current turn.
     *
     * @param context Live session/project values for the placeholders.
     * @param projectOverride Optional project-level system-prompt override
     *   that layers on top of the base runtime prompt (never replaces CORE RULES).
     */
    fun build(
        context: SessionContext,
        projectOverride: String? = null
    ): String {
        val filled = BASE_TEMPLATE
            .replace("{project_name}", context.projectName.ifBlank { "(unnamed)" })
            .replace("{module_list}", context.moduleList.ifBlank { "(not yet indexed)" })
            .replace("{project_notes}", context.projectNotes.ifBlank { "(none)" })
            .replace("{session_file_log}", context.sessionFileLog.ifBlank { "(none this session)" })

        return if (projectOverride.isNullOrBlank()) {
            filled
        } else {
            buildString {
                append(filled)
                append("\n\n# Project-level override\n")
                append(projectOverride.trim())
            }
        }
    }
}
