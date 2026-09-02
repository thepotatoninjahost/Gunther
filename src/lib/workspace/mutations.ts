import { APPROVAL_EXPIRATION_MS, checkConstitution } from "@/lib/agent/constitution";
import type {
  MutationApprovalResult,
  PendingChangeProposal,
  ProposeResult,
  TaskOperation,
} from "@/lib/agent/types";
import { uid } from "@/lib/utils";
import type { ProjectWorkspace } from "./workspace";

/**
 * Dual-approval staging. Shares the injected ProjectWorkspace — never
 * constructs its own copy (that was the dual-workspace bug).
 */
export class MutationCoordinator {
  private pending = new Map<string, PendingChangeProposal>();

  constructor(private readonly workspace: ProjectWorkspace) {}

  async propose(
    request: string,
    operations: TaskOperation[],
    reason = request,
  ): Promise<ProposeResult> {
    if (!request.trim()) return { kind: "rejected", reason: "Request required" };
    if (!operations.length) return { kind: "rejected", reason: "Operations required" };
    let changeSet;
    try {
      changeSet = await this.workspace.preview(operations, reason);
    } catch (error) {
      return { kind: "rejected", reason: error instanceof Error ? error.message : "Preview failed" };
    }
    if (!changeSet.changes.length) return { kind: "rejected", reason: "No changes produced" };
    const verification = await this.workspace.verifyProposal(changeSet);
    if (!verification.passed) {
      return {
        kind: "rejected",
        reason: `Verification failed: ${verification.issues.map((i) => i.message).join("; ")}`,
      };
    }
    const timestamp = Date.now();
    const proposal: PendingChangeProposal = {
      id: uid("prop"),
      request,
      changeSet,
      verification,
      createdAt: timestamp,
      expiresAt: timestamp + APPROVAL_EXPIRATION_MS,
      approvals: [],
    };
    this.pending.set(proposal.id, proposal);
    return { kind: "proposed", proposal };
  }

  get(id: string): PendingChangeProposal | undefined {
    return this.pending.get(id);
  }

  list(): PendingChangeProposal[] {
    return [...this.pending.values()];
  }

  reject(id: string): boolean {
    return this.pending.delete(id);
  }

  async approve(
    id: string,
    ownerVerified: boolean,
    ownerLabel: string,
  ): Promise<MutationApprovalResult> {
    const proposal = this.pending.get(id);
    if (!proposal) return { kind: "rejected", reason: "Change proposal does not exist" };
    const timestamp = Date.now();
    if (timestamp > proposal.expiresAt) {
      this.pending.delete(id);
      return { kind: "rejected", reason: "Change proposal approval expired" };
    }
    if (!ownerVerified) {
      return { kind: "rejected", reason: "Owner verification is required for every approval" };
    }
    const approval = {
      actionId: id,
      approvedAt: timestamp,
      ownerLabel,
      confirmationNumber: proposal.approvals.length + 1,
    };
    const candidate: PendingChangeProposal = {
      ...proposal,
      approvals: [...proposal.approvals, approval],
    };
    const violations = checkConstitution(
      {
        description: proposal.request,
        category: "CODE_CHANGE",
        ownerVerified,
        approvalCount: candidate.approvals.length,
        sandboxPassed: proposal.verification.passed,
        clearPermission: true,
      },
      timestamp,
      proposal.createdAt,
    );
    if (violations.length) {
      this.pending.set(id, candidate);
      const hard = violations.some(
        (v) =>
          v.rule === "OWNER_LOCK" ||
          v.rule === "SANDBOX_FIRST" ||
          v.rule === "PERMISSION_EXPIRATION",
      );
      if (candidate.approvals.length < 1 && !hard) {
        return { kind: "awaiting-second", proposal: candidate, approval };
      }
      return {
        kind: "rejected",
        reason: violations.map((v) => `${v.rule}: ${v.message}`).join("; "),
      };
    }
    try {
      const applied = await this.workspace.applyApproved(proposal.changeSet);
      this.pending.delete(id);
      return { kind: "applied", proposal: candidate, changeSet: applied };
    } catch (error) {
      return {
        kind: "rejected",
        reason: `Approved change could not be applied: ${error instanceof Error ? error.message : "unknown"}`,
      };
    }
  }

  hydrate(proposals: PendingChangeProposal[]) {
    this.pending.clear();
    for (const proposal of proposals) this.pending.set(proposal.id, proposal);
  }
}
