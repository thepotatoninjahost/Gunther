import type { ChatMessage, FileMap, LlmMessage } from "./types";
import type { MutationCoordinator } from "@/lib/workspace/mutations";
import type { ProjectWorkspace } from "@/lib/workspace/workspace";
import { tryDirectLane } from "./lanes";
import { agentTurn } from "./llm";
import { DEFAULT_INSTRUCTION_SHEET, repoMap } from "./prompt";
import { dispatchTool } from "./tools";

const MAX_TURNS = 8;

export type LoopHandlers = {
  onEvent: (phase: string, detail: string) => void;
  onProposal: (id: string) => void;
  isCancelled: () => boolean;
};

export type LoopResult = {
  text: string;
  failed: boolean;
  proposalId?: string;
};

export async function runAgentLoop(
  request: string,
  opts: {
    workspace: ProjectWorkspace;
    mutations: MutationCoordinator;
    files: FileMap;
    history: ChatMessage[];
    instructionSheet: string;
    handlers: LoopHandlers;
  },
): Promise<LoopResult> {
  const { workspace, mutations, files, handlers } = opts;
  handlers.onEvent("INTAKE", "Inspecting the request and repository");

  const lane = await tryDirectLane(request, workspace, files, mutations);
  if (lane.handled) {
    handlers.onEvent("DONE", lane.proposalId ? "Proposal staged" : "Direct lane");
    if (lane.proposalId) handlers.onProposal(lane.proposalId);
    return { text: lane.reply, failed: false, proposalId: lane.proposalId };
  }

  const sheet = opts.instructionSheet.trim() || DEFAULT_INSTRUCTION_SHEET;
  const prior = opts.history
    .filter((m) => m.role === "user" || m.role === "agent")
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Owner" : "Agent"}: ${m.content}`)
    .join("\n");

  const system: LlmMessage = {
    role: "system",
    content: `${sheet}\n\n${repoMap(files, workspace)}\n\nPrior chat (truncated):\n${prior || "(none)"}`,
  };

  const messages: LlmMessage[] = [system, { role: "user", content: request }];

  let proposalId: string | undefined;
  let lastText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (handlers.isCancelled()) {
      return { text: lastText || "Stopped by owner.", failed: true, proposalId };
    }
    handlers.onEvent("MODEL", `Turn ${turn + 1}/${MAX_TURNS}`);
    const result = await agentTurn({ data: { messages } });
    if (!result.ok) {
      handlers.onEvent("FAILED", result.error);
      return { text: result.error, failed: true, proposalId };
    }
    if (result.toolCalls.length) {
      const call = result.toolCalls[0];
      handlers.onEvent("TOOL", call.function.name);
      messages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls,
      });
      const output = await dispatchTool(call.function.name, call.function.arguments, {
        workspace,
        mutations,
        request,
        onProposal: (id) => {
          proposalId = id;
          handlers.onProposal(id);
        },
      });
      messages.push({ role: "tool", tool_call_id: call.id, content: output });
      if (output.startsWith("PROPOSED ")) {
        handlers.onEvent("APPROVAL", "Change staged — dual owner approval required");
      }
      continue;
    }
    lastText = (result.content ?? "").trim();
    if (lastText) {
      handlers.onEvent("DONE", "Completed");
      return { text: lastText, failed: false, proposalId };
    }
    handlers.onEvent("FAILED", "Model returned an empty answer");
    return { text: "The model returned an empty answer. Retry the request.", failed: true, proposalId };
  }

  const fallback =
    lastText || "Stopped after the turn budget. Evidence is in the log — retry to continue.";
  handlers.onEvent("DONE", "Turn budget reached");
  return { text: fallback, failed: false, proposalId };
}
