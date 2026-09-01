import { Button } from "@/components/ui/button";

export function ApprovalCard({
  approvalCount,
  reason,
  onApprove,
}: {
  approvalCount: number;
  reason: string;
  onApprove: () => void;
}) {
  return (
    <div className="rounded-xl border border-warn/50 bg-raised p-4">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-warn">
        Code change review
      </p>
      <p className="mt-2 text-sm text-fg">{reason}</p>
      <p className="mt-1 text-xs text-muted">
        Two explicit approvals are required before a code transaction can proceed.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-xs tabular-nums text-muted">{approvalCount}/2</span>
        <Button variant="warn" onClick={onApprove}>
          {approvalCount === 0 ? "Confirm" : "Confirm again"}
        </Button>
      </div>
    </div>
  );
}
