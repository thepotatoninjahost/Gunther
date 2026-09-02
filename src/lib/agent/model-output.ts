import type { LlmToolCall } from "./types";

const KNOWN_TOOLS = new Set([
  "list_files",
  "read_file",
  "search_project",
  "search_knowledge",
  "research_web",
  "replace_text",
  "create_file",
  "append_text",
  "run_command",
  "verify",
]);

/**
 * ONE JOB: Turn a provider message body into text and/or tool calls.
 * Free OpenRouter routes often put tools in XML/text or leave content
 * empty while filling reasoning_content.
 */
export function extractMessageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const row = message as Record<string, unknown>;
  const fromContent = stringifyContent(row.content);
  if (fromContent.trim()) return fromContent;
  const reasoning = stringifyContent(row.reasoning_content ?? row.reasoning);
  return reasoning;
}

export function extractToolCalls(message: unknown, fallbackText = ""): LlmToolCall[] {
  const fromField = fieldToolCalls(message);
  if (fromField.length) return fromField.slice(0, 4);
  return parseToolCallsFromText(fallbackText || extractMessageText(message)).slice(0, 4);
}

export function stripThink(text: string): string {
  const think = tag("think");
  const thinking = tag("thinking");
  return text
    .replace(new RegExp(`${think.open}[\\s\\S]*?${think.close}`, "gi"), "")
    .replace(new RegExp(`${thinking.open}[\\s\\S]*?${thinking.close}`, "gi"), "")
    .trim();
}

function tag(name: string): { open: string; close: string } {
  return { open: `<${name}\\b[^>]*>`, close: `<\\/${name}>` };
}

export function parseToolCallsFromText(raw: string): LlmToolCall[] {
  const text = raw.trim();
  if (!text) return [];
  const xml = parseXmlToolCalls(text);
  if (xml.length) return xml;
  const json = parseJsonToolCalls(text);
  if (json.length) return json;
  return [];
}

export function isRetryableProviderError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("provider returned") ||
    lower.includes("provider error") ||
    lower.includes("empty answer") ||
    lower.includes("empty response") ||
    lower.includes("no response") ||
    lower.includes("timed out") ||
    lower.includes("too long") ||
    /\\b(429|500|502|503|504)\\b/.test(lower)
  );
}

export function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("401") ||
    lower.includes("paste an openrouter key") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized") ||
    lower.includes("no key")
  );
}

function stringifyContent(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const row = part as Record<string, unknown>;
        if (typeof row.text === "string") return row.text;
        if (typeof row.content === "string") return row.content;
        return "";
      })
      .join("");
  }
  return "";
}

function fieldToolCalls(message: unknown): LlmToolCall[] {
  if (!message || typeof message !== "object") return [];
  const raw = (message as Record<string, unknown>).tool_calls;
  if (!Array.isArray(raw)) return [];
  const out: LlmToolCall[] = [];
  for (const item of raw) {
    const call = normalizeToolCall(item);
    if (call) out.push(call);
  }
  return out;
}

function normalizeToolCall(item: unknown): LlmToolCall | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const fn = row.function && typeof row.function === "object" ? (row.function as Record<string, unknown>) : row;
  const name = String(fn.name ?? row.name ?? "").trim();
  if (!name || !KNOWN_TOOLS.has(name)) return null;
  const args = fn.arguments ?? row.arguments ?? {};
  const encoded = typeof args === "string" ? args : JSON.stringify(args ?? {});
  const id = String(row.id ?? `call_${name}_${Math.random().toString(36).slice(2, 8)}`);
  return { id, type: "function", function: { name, arguments: encoded || "{}" } };
}

function parseXmlToolCalls(text: string): LlmToolCall[] {
  const toolCall = tag("tool_call");
  if (!new RegExp(`<tool_call`, "i").test(text) && !new RegExp(`<function\\s*=`, "i").test(text)) return [];
  const blocks = text.match(new RegExp(`${toolCall.open}[\\s\\S]*?${toolCall.close}`, "gi")) ?? [text];
  const out: LlmToolCall[] = [];
  for (const block of blocks) {
    const name =
      /<function\\s*=\\s*([A-Za-z0-9_]+)/i.exec(block)?.[1] ??
      /<tool_call[^>]*\\bname\\s*=\\s*["']([A-Za-z0-9_]+)["']/i.exec(block)?.[1];
    if (!name || !KNOWN_TOOLS.has(name)) continue;
    const args: Record<string, string> = {};
    const param = new RegExp(
      `<parameter\\s*=\\s*([A-Za-z0-9_]+)>\\s*([\\s\\S]*?)\\s*<\\/parameter>`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = param.exec(block))) {
      args[match[1]] = match[2].trim();
    }
    out.push({
      id: `xml_${name}_${out.length}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    });
  }
  return out;
}

function parseJsonToolCalls(text: string): LlmToolCall[] {
  const candidates: unknown[] = [];
  const fence = /```(?:json)?\\s*([\\s\\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) {
    candidates.push(tryParse(match[1]));
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(tryParse(text.slice(start, end + 1)));
  const out: LlmToolCall[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const rows = Array.isArray(candidate)
      ? candidate
      : typeof candidate === "object"
        ? [candidate]
        : [];
    for (const row of rows) {
      const obj = row as Record<string, unknown>;
      if (obj.tool_calls) {
        out.push(...fieldToolCalls({ tool_calls: obj.tool_calls }));
        continue;
      }
      const name = String(obj.tool ?? obj.name ?? "").trim();
      if (!KNOWN_TOOLS.has(name)) continue;
      const args = obj.arguments ?? obj.parameters ?? {};
      out.push({
        id: `json_${name}_${out.length}`,
        type: "function",
        function: {
          name,
          arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
        },
      });
    }
  }
  return out;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isRetiredCoderId(model: string): boolean {
  const id = model.trim().toLowerCase();
  return (
    id === "qwen3-coder" ||
    id.startsWith("qwen/qwen3-coder") ||
    id === "qwen3-coder-next" ||
    id === "qwen3-coder-plus"
  );
}
