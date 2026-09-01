import type { FileMap } from "@/lib/agent/types";
import type { ProjectWorkspace } from "@/lib/workspace/workspace";

export const DEFAULT_INSTRUCTION_SHEET = `You are the Coding-Agent on this device. You extend the model with tools and real evidence — never invent paths or file contents.

Operating rules:
1. Gather real evidence with tools. Never invent file contents or paths.
2. If the user names a file, call read_file on it before analysis or a final answer.
3. Exactly one tool call this turn. Observe the full result before the next step.
4. Code changes only stage a proposal (create_file / replace_text / append_text). Dual owner approval is required. You cannot approve writes.
5. Call verify after changes or when hunting bugs. Never report a fake pass.
6. Use search_knowledge for handbook practice. Use research_web when you lack current docs, APIs, or errors not in the project. Empty research fails closed.
7. Persist until the goal is met. Only stop early for a specific missing user input.
8. After real file reads or project search hits, WRITE THE ANSWER. Do not keep listing.
9. Prefer project files over inventing local paths. Prefer the smallest REPLACE that fixes a defect.
10. Do not leave TODO, FIXME, or IMPLEMENT_ME in patches you stage.

Money/ledger domain: store cents as integers, reject non-finite amounts, reject overdrafts, format negatives with a leading minus, fail closed on NaN parse.`;

export function repoMap(files: FileMap, workspace: ProjectWorkspace, maxPaths = 80): string {
  const paths = Object.keys(files).sort();
  const summary = workspace.summary();
  const langs = Object.entries(summary.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const listed = paths.slice(0, maxPaths).join("\n");
  const extra =
    paths.length > maxPaths ? `\n… and ${paths.length - maxPaths} more (use list_files / search_project)` : "";
  return `Repo map — indexed sources: ${paths.length}. Languages: ${langs || "none"}.\n${listed || "(no indexed source files)"}${extra}`;
}

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "list_files",
      description: "List project-relative source paths, optionally under a directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Directory prefix. Empty for repo root." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a project file. Path must exist.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_project",
      description: "Search file contents for a literal query.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_knowledge",
      description: "Search the local coding handbook chunks.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "research_web",
      description: "Research a topic using the model knowledge path. Fails closed if empty.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "replace_text",
      description: "Stage a REPLACE proposal. old_text must match exactly once.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_file",
      description: "Stage a CREATE proposal for a new path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          text: { type: "string" },
        },
        required: ["path", "text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "append_text",
      description: "Stage an APPEND proposal.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          text: { type: "string" },
        },
        required: ["path", "text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description: "Run a read-only shell command against the project copy (ls, cat, grep, …).",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "verify",
      description: "Run the static unfinished-work scan. Never a compiler.",
      parameters: { type: "object", properties: {} },
    },
  },
];
