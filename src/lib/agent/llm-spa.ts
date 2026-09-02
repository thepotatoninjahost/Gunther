import { z } from "zod";
import type { AgentTurnResult, LlmMessage, ResearchHit } from "./types";
import { TOOL_DEFINITIONS } from "./prompt";

const NEED_KEY = "Paste an OpenRouter key in Settings (sk-or-…). Free: openrouter.ai/keys";

type NativeResult = {
  status: number;
  json?: {
    error?: { message?: string; type?: string; code?: string } | string;
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }[];
      };
    }[];
  };
  body?: string;
  error?: string;
};

declare global {
  interface Window {
    GuntherNative?: {
      hasKey: () => boolean;
      setApiKey: (key: string) => void;
      clearApiKey: () => void;
      getModel: () => string;
      getEndpoint: () => string;
      setGateway: (endpoint: string, model: string) => void;
      complete: (requestId: string, payloadJson: string) => void;
    };
    GuntherFiles?: {
      pickFolder: () => void;
      pickFiles: () => void;
    };
    __guntherNativeDone?: (requestId: string, result: NativeResult) => void;
    __guntherWait?: Record<string, (result: NativeResult) => void>;
    __guntherImport?: (name: string, files: Record<string, string>) => void;
  }
}

function native() {
  if (typeof window === "undefined") return undefined;
  return window.GuntherNative;
}

function nativeHasKey(): boolean {
  const bridge = native();
  if (!bridge) return false;
  try {
    return Boolean(bridge.hasKey());
  } catch {
    return false;
  }
}

function nativeComplete(payload: unknown): Promise<NativeResult> {
  const bridge = native();
  if (!bridge) return Promise.resolve({ status: 0, error: NEED_KEY });
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      delete window.__guntherWait?.[requestId];
      resolve({ status: 0, error: "The model took too long. Try again." });
    }, 58000);
    window.__guntherWait = window.__guntherWait ?? {};
    window.__guntherWait[requestId] = (result) => {
      window.clearTimeout(timer);
      delete window.__guntherWait?.[requestId];
      resolve(result);
    };
    window.__guntherNativeDone = (id, result) => {
      window.__guntherWait?.[id]?.(result);
    };
    bridge.complete(requestId, JSON.stringify(payload));
  });
}

function describeError(result: NativeResult): string {
  const nested = result.json?.error;
  const nestedMsg = typeof nested === "string" ? nested : nested?.message;
  const msg = (nestedMsg || result.error || result.body || "").trim();
  if (result.status === 401) return msg || "Key rejected (401). Paste an OpenRouter key (sk-or-) from openrouter.ai/keys";
  if (result.status === 403) return msg || "Forbidden (403). Check the Groq key and model.";
  return msg || `API error ${result.status}`;
}

function gatewayError(result: NativeResult): AgentTurnResult {
  return { ok: false, error: describeError(result) };
}

export async function probeAi(): Promise<{ available: boolean }> {
  return { available: nativeHasKey() };
}

function toTurn(result: NativeResult): AgentTurnResult {
  if (result.status < 200 || result.status >= 300 || !result.json) return gatewayError(result);
  const message = result.json.choices?.[0]?.message;
  return {
    ok: true,
    content: message?.content ?? null,
    toolCalls: (message?.tool_calls ?? []).slice(0, 1),
  };
}

function nativeModel(): string {
  const bridge = native();
  if (!bridge) return "poolside/laguna-s-2.1:free";
  try {
    return bridge.getModel() || "poolside/laguna-s-2.1:free";
  } catch {
    return "poolside/laguna-s-2.1:free";
  }
}

async function completeTurn(messages: LlmMessage[]): Promise<NativeResult> {
  const model = nativeModel();
  const attempts: unknown[] = [
    { model, temperature: 0.2, max_tokens: 1600, tools: TOOL_DEFINITIONS, messages },
    { model, temperature: 0.2, max_tokens: 1600, messages },
  ];
  let last: NativeResult = { status: 0, error: "No response" };
  for (const payload of attempts) {
    last = await nativeComplete(payload);
    if (last.status >= 200 && last.status < 300 && last.json) return last;
    if (last.status === 401) return last;
  }
  return last;
}

export async function agentTurn(input: {
  data?: { messages: LlmMessage[] };
  messages?: LlmMessage[];
}): Promise<AgentTurnResult> {
  const messages = input.data?.messages ?? input.messages ?? [];
  if (!nativeHasKey()) return { ok: false, error: NEED_KEY };
  return toTurn(await completeTurn(messages));
}

export async function researchTopic(input: {
  data?: { query: string };
  query?: string;
}): Promise<{ ok: true; hits: ResearchHit[] } | { ok: false; error: string }> {
  const query = input.data?.query ?? input.query ?? "";
  if (!nativeHasKey()) return { ok: false, error: NEED_KEY };
  const result = await nativeComplete({
    model: nativeModel(),
    temperature: 0.1,
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content:
          'Return JSON only: {"hits":[{"title":"","excerpt":"","url":""}]}. 3-6 sourced notes. If you lack evidence, return {"hits":[]}. Do not invent URLs; use canonical docs or omit the hit. Fail closed.',
      },
      { role: "user", content: query },
    ],
  });
  if (result.status < 200 || result.status >= 300) {
    return { ok: false, error: describeError(result) };
  }
  const text = result.json?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(text);
  const hits = z
    .array(z.object({ title: z.string(), excerpt: z.string(), url: z.string() }))
    .safeParse(parsed?.hits);
  if (!hits.success) return { ok: true, hits: [] };
  return { ok: true, hits: hits.data.slice(0, 6) };
}

function extractJson(text: string): { hits?: unknown } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { hits?: unknown };
  } catch {
    return null;
  }
}
