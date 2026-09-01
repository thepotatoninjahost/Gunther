import { z } from "zod";
import type { MutationCoordinator } from "@/lib/workspace/mutations";
import type { ProjectWorkspace } from "@/lib/workspace/workspace";
import { runCommand } from "@/lib/workspace/terminal";
import { searchKnowledge } from "@/lib/knowledge/search";
import { clampText } from "@/lib/utils";
import { researchTopic } from "./llm";

const MAX = 6_000;

const PathArgs = z.object({ path: z.string().optional() });
const ReadArgs = z.object({ path: z.string().min(1) });
const QueryArgs = z.object({ query: z.string().min(1) });
const ReplaceArgs = z.object({
  path: z.string().min(1),
  old_text: z.string().min(1),
  new_text: z.string(),
});
const CreateArgs = z.object({ path: z.string().min(1), text: z.string() });
const AppendArgs = z.object({ path: z.string().min(1), text: z.string().min(1) });
const CommandArgs = z.object({ command: z.string().min(1) });

export type ToolContext = {
  workspace: ProjectWorkspace;
  mutations: MutationCoordinator;
  request: string;
  onProposal: (id: string) => void;
};

export async function dispatchTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<string> {
  try {
    const args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    switch (name) {
      case "list_files": {
        const { path } = PathArgs.parse(args);
        const listed = ctx.workspace.list(path?.trim() || "");
        return clampText(listed.length ? listed.join("\n") : "(no files)", MAX);
      }
      case "read_file": {
        const { path } = ReadArgs.parse(args);
        return clampText(ctx.workspace.read(path), MAX);
      }
      case "search_project": {
        const { query } = QueryArgs.parse(args);
        const hits = ctx.workspace.search(query);
        return clampText(
          hits.length ? hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n") : "(no hits)",
          MAX,
        );
      }
      case "search_knowledge": {
        const { query } = QueryArgs.parse(args);
        const hits = searchKnowledge(query);
        return clampText(
          hits.length
            ? hits.map((h) => `${h.document}/${h.section} (${h.score}): ${h.excerpt}`).join("\n")
            : "(no handbook hits)",
          MAX,
        );
      }
      case "research_web": {
        const { query } = QueryArgs.parse(args);
        const result = await researchTopic({ data: { query } });
        if (!result.ok) return `ERROR: ${result.error}`;
        if (!result.hits.length) return "ERROR: Research returned no evidence (fail closed).";
        return clampText(
          result.hits.map((h) => `${h.title}\n${h.excerpt}\n${h.url}`).join("\n\n"),
          MAX,
        );
      }
      case "replace_text": {
        const { path, old_text, new_text } = ReplaceArgs.parse(args);
        const proposed = await ctx.mutations.propose(
          ctx.request,
          [{ kind: "REPLACE", path, oldText: old_text, newText: new_text }],
          `replace in ${path}`,
        );
        if (proposed.kind === "rejected") return `ERROR: ${proposed.reason}`;
        ctx.onProposal(proposed.proposal.id);
        return `PROPOSED id=${proposed.proposal.id} path=${path} op=REPLACE — awaiting dual owner approval. Do not claim the write landed.`;
      }
      case "create_file": {
        const { path, text } = CreateArgs.parse(args);
        const proposed = await ctx.mutations.propose(
          ctx.request,
          [{ kind: "CREATE", path, text }],
          `create ${path}`,
        );
        if (proposed.kind === "rejected") return `ERROR: ${proposed.reason}`;
        ctx.onProposal(proposed.proposal.id);
        return `PROPOSED id=${proposed.proposal.id} path=${path} op=CREATE — awaiting dual owner approval.`;
      }
      case "append_text": {
        const { path, text } = AppendArgs.parse(args);
        const proposed = await ctx.mutations.propose(
          ctx.request,
          [{ kind: "APPEND", path, text }],
          `append ${path}`,
        );
        if (proposed.kind === "rejected") return `ERROR: ${proposed.reason}`;
        ctx.onProposal(proposed.proposal.id);
        return `PROPOSED id=${proposed.proposal.id} path=${path} op=APPEND — awaiting dual owner approval.`;
      }
      case "run_command": {
        const { command } = CommandArgs.parse(args);
        const result = runCommand(ctx.workspace.snapshot(), "", command);
        return clampText(
          `exit=${result.exitCode}\n${result.stdout}\n${result.stderr}`.trim(),
          MAX,
        );
      }
      case "verify": {
        const report = ctx.workspace.verify();
        const issues = report.issues
          .map((issue) => `${issue.path}:${issue.line}: ${issue.message}`)
          .join("\n");
        return clampText(`passed=${report.passed}\n${issues}`, MAX);
      }
      default:
        return `ERROR: Unknown tool '${name}'`;
    }
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : "tool failed"}`;
  }
}
