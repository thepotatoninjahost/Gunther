import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchHit } from "@/lib/agent/types";
import { knowledgeStats } from "@/lib/knowledge/search";

export function ResearchSurface({
  query,
  onQuery,
  hits,
  error,
  busy,
  onSearch,
}: {
  query: string;
  onQuery: (value: string) => void;
  hits: ResearchHit[];
  error: string | null;
  busy: boolean;
  onSearch: () => void;
}) {
  const stats = knowledgeStats();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden gap-3 p-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Research</h2>
        <p className="mt-1 text-sm text-muted">
          Local handbook ({stats.chunks} chunks) plus a fail-closed model brief. Empty evidence is
          reported as empty.
        </p>
      </div>
      <Textarea
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Describe what you want to research in plain English…"
        rows={5}
      />
      <Button onClick={onSearch} disabled={!query.trim() || busy}>
        {busy ? "Searching…" : "Search"}
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {hits.map((hit) => (
            <article key={`${hit.url}-${hit.title}`} className="rounded-lg border border-border bg-raised p-3">
              <h3 className="text-sm font-medium text-fg">{hit.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{hit.excerpt}</p>
              <p className="mt-2 break-all font-mono text-[11px] text-warn">{hit.url}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
