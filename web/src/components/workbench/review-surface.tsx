import { Button } from "@/components/ui/button";
import type { ChangeSet, PendingChangeProposal } from "@/lib/agent/types";
import { unifiedDiff } from "@/lib/workspace/diff";
import { shortId } from "@/lib/utils";

export function ReviewSurface({
  pending,
  transactions,
  onApprove,
  onReject,
  onRollback,
}: {
  pending: PendingChangeProposal | null;
  transactions: ChangeSet[];
  onApprove: () => void;
  onReject: () => void;
  onRollback: () => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <h2 className="font-display text-lg font-semibold text-fg">Change review</h2>
      <p className="mt-1 text-sm text-muted">
        Transactional writes stay checksum-guarded. Two owner confirmations apply the patch.
      </p>

      {!pending ? (
        <div className="mt-10 text-center">
          <p className="font-medium text-fg">No pending changes</p>
          <p className="mt-1 text-sm text-muted">Agent and editor proposals appear here before any write.</p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-warn/50 bg-raised p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-warn">
            Pending · {shortId(pending.id)}
          </p>
          <p className="mt-2 text-sm text-fg">{pending.request}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            verify={pending.verification.passed ? "passed" : "failed"} · {pending.approvals.length}/2
            confirmations
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {pending.changeSet.changes.map((change) => (
              <pre
                key={change.path}
                className="overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-[11px] leading-4 text-accent"
              >
                {unifiedDiff(change.path, change.before, change.after)}
              </pre>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={onReject} className="flex-1">
              Reject
            </Button>
            <Button variant="warn" onClick={onApprove} className="flex-1">
              Confirm {pending.approvals.length + 1}/2
            </Button>
          </div>
        </div>
      )}

      {transactions.length > 0 ? (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-fg">Applied transactions</h3>
            <Button variant="outline" size="sm" onClick={onRollback}>
              Rollback last
            </Button>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {[...transactions].reverse().map((tx) => (
              <li key={tx.id} className="rounded-lg border border-border bg-raised px-3 py-2">
                <p className="font-mono text-xs text-muted">{shortId(tx.id)}</p>
                <p className="text-sm text-fg">{tx.reason}</p>
                <p className="font-mono text-[11px] text-muted">
                  {tx.changes.map((c) => `${c.operation} ${c.path}`).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
