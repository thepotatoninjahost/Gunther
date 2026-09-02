import { searchWeb } from "@/lib/native/disk";
import type { AgentTurnResult, LlmMessage, ResearchHit } from "./types";
import { TOOL_DEFINITIONS } from "./prompt";
import {
  extractMessageText,
  extractToolCalls,
  isRetryableProviderError,
  isRetiredCoderId,
} from "./model-output";

const NEED_KEY = "Paste an OpenRouter key in Settings (sk-or-…). Free: openrouter.ai/keys";

type NativeResult = {
  status: number;
  json?: {
    error?: { message?: string; type?: string; code?: string } | string;
    choices?: {
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        reasoning?: string | null;
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
      writeFile: (path: string, content: string) => string;
      deleteFile: (path: string) => string;
      hasDisk: () => boolean;
      runShell: (requestId: string, command: string) => void;
      searchWeb: (requestId: string, query: string) => void;
      verify: (requestId: string) => void;
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
  if (result.status === 403) return msg || "Forbidden (403). Check the key and model.";
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
  const content = extractMessageText(message);
  const toolCalls = extractToolCalls(message, content);
  return {
    ok: true,
    content: content || null,
    toolCalls,
  };
}

function nativeModel(): string {
  const fallback = "poolside/laguna-s-2.1:free";
  const bridge = native();
  if (!bridge) return fallback;
  try {
    const raw = bridge.getModel() || fallback;
    if (!isRetiredCoderId(raw)) return raw;
    try {
      bridge.setGateway("https://openrouter.ai/api/v1/chat/completions", fallback);
    } catch {
      /* keep serving the free id even if prefs write fails */
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function usable(result: NativeResult): boolean {
  if (result.status < 200 || result.status >= 300 || !result.json) return false;
  const message = result.json.choices?.[0]?.message;
  const content = extractMessageText(message);
  return Boolean(content.trim() || extractToolCalls(message, content).length);
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
    if (usable(last)) return last;
    if (last.status === 401) return last;
    const detail = describeError(last);
    if (!isRetryableProviderError(detail) && last.status >= 200 && last.status < 300) {
      continue;
    }
    if (isRetryableProviderError(detail) || last.status >= 500 || last.status === 429 || last.status === 0) {
      last = await nativeComplete(payload);
      if (usable(last)) return last;
    }
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
  const result = await searchWeb(query);
  if (!result.ok) return { ok: false, error: result.error || "Web search failed" };
  const hits = (result.hits ?? []).filter((h) => h.title || h.excerpt || h.url).slice(0, 8);
  if (!hits.length) return { ok: false, error: "No web results" };
  return { ok: true, hits };
}
