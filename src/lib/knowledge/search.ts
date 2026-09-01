import type { KnowledgeHit } from "@/lib/agent/types";
import { KNOWLEDGE_CHUNKS } from "./chunks";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

export function searchKnowledge(query: string, limit = 6): KnowledgeHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  return KNOWLEDGE_CHUNKS.map((chunk) => {
    const haystack = tokenize(chunk.text + " " + chunk.section);
    const score = terms.reduce((total, term) => {
      if (haystack.includes(term)) return total + 3;
      if (haystack.some((h) => h.startsWith(term))) return total + 1;
      return total;
    }, 0);
    const excerpt = excerptAround(chunk.text, terms);
    return { document: chunk.document, section: chunk.section, score, excerpt };
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function excerptAround(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      at = idx;
      break;
    }
  }
  if (at < 0) return text.slice(0, 180);
  const start = Math.max(0, at - 40);
  const slice = text.slice(start, start + 220);
  return `${start > 0 ? "…" : ""}${slice}${start + 220 < text.length ? "…" : ""}`;
}

export function knowledgeStats() {
  return {
    documents: new Set(KNOWLEDGE_CHUNKS.map((c) => c.document)).size,
    chunks: KNOWLEDGE_CHUNKS.length,
  };
}
