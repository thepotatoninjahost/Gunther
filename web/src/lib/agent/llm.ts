import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AgentTurnResult, LlmMessage, ResearchHit } from "./types";
import { TOOL_DEFINITIONS } from "./prompt";

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

const MessageSchema = z.union([
  z.object({ role: z.literal("system"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    tool_calls: z.array(ToolCallSchema).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    tool_call_id: z.string(),
    content: z.string(),
  }),
]);

const TurnInput = z.object({
  messages: z.array(MessageSchema).max(24),
});

const ResearchInput = z.object({
  query: z.string().min(3).max(500),
});

const CREDITS_ERROR =
  "The model gateway has no remaining credits. List, read, verify, terminal, local research, and starter patches still work.";

function gatewayError(status: number, body = ""): AgentTurnResult {
  if (status === 401 || status === 403) return { ok: false, error: CREDITS_ERROR };
  return {
    ok: false,
    error: `xAI API error ${status}${body ? `: ${body.slice(0, 240)}` : ""}`,
  };
}

export const probeAi = createServerFn({ method: "POST" }).handler(async () => {
  return { available: Boolean(process.env.XAI_API_KEY) };
});

export const agentTurn = createServerFn({ method: "POST" })
  .validator((input: unknown) => TurnInput.parse(input))
  .handler(async ({ data }): Promise<AgentTurnResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment" };

    const messages = data.messages as LlmMessage[];
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: 1600,
        parallel_tool_calls: false,
        tools: TOOL_DEFINITIONS,
        messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return gatewayError(res.status, body);
    }
    const json = (await res.json()) as {
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
    const message = json.choices?.[0]?.message;
    return {
      ok: true,
      content: message?.content ?? null,
      toolCalls: (message?.tool_calls ?? []).slice(0, 1),
    };
  });

export const researchTopic = createServerFn({ method: "POST" })
  .validator((input: unknown) => ResearchInput.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; hits: ResearchHit[] } | { ok: false; error: string }> => {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { ok: false, error: "AI is not available in this environment" };

      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.1,
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content:
                'Return JSON only: {"hits":[{"title":"","excerpt":"","url":""}]}. 3-6 sourced notes. If you lack evidence, return {"hits":[]}. Do not invent URLs; use canonical docs or omit the hit. Fail closed.',
            },
            { role: "user", content: data.query },
          ],
        }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return { ok: false, error: CREDITS_ERROR };
        return { ok: false, error: `xAI API error ${res.status}` };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(text);
      const hits = z
        .array(z.object({ title: z.string(), excerpt: z.string(), url: z.string() }))
        .safeParse(parsed?.hits);
      if (!hits.success) return { ok: true, hits: [] };
      return { ok: true, hits: hits.data.slice(0, 6) };
    },
  );

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
