import type { AgentTurnResult, ResearchHit } from "./types";

const OFFLINE =
  "This phone build runs the agent locally. List, read, verify, terminal, handbook search, and starter patches work on-device.";

export async function probeAi(): Promise<{ available: boolean }> {
  return { available: false };
}

export async function agentTurn(): Promise<AgentTurnResult> {
  return { ok: false, error: OFFLINE };
}

export async function researchTopic(): Promise<
  { ok: true; hits: ResearchHit[] } | { ok: false; error: string }
> {
  return { ok: false, error: OFFLINE };
}
