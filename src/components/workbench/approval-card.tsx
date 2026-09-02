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
      <p className="mt-1 text-xs text-muted">Tap Confirm to apply the patch.</p>
      <div className="mt-3 flex items-center justify-end">
        <Button variant="warn" onClick={onApprove}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
