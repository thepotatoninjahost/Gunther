import { checkConstitution, type AgentAction } from "@/lib/agent/constitution";
import type { VerificationReport } from "@/lib/agent/types";
import { sha256Hex } from "@/lib/workspace/checksum";
import { uid } from "@/lib/utils";

export type LiveModule = {
  id: string;
  kind: string;
  version: number;
  source: string;
  checksum: string;
  createdAt: number;
};

export type ModuleInstallResult =
  | { kind: "installed"; module: LiveModule }
  | { kind: "rejected"; reason: string };

/**
 * Live-module install does not manufacture constitution compliance.
 * The caller must pass a real AgentAction (ownerVerified, two approvals,
 * sandboxPassed from an actual evaluation).
 */
export async function installLiveModule(
  source: string,
  kind: string,
  version: number,
  action: AgentAction,
  evaluation: VerificationReport,
): Promise<ModuleInstallResult> {
  if (!evaluation.passed) {
    return { kind: "rejected", reason: "Module evaluation did not pass" };
  }
  const violations = checkConstitution(action);
  if (violations.length) {
    return {
      kind: "rejected",
      reason: violations.map((v) => `${v.rule}: ${v.message}`).join("; "),
    };
  }
  if (!source.trim()) return { kind: "rejected", reason: "Module source is empty" };
  const checksum = await sha256Hex(source);
  return {
    kind: "installed",
    module: {
      id: uid("mod"),
      kind,
      version,
      source,
      checksum,
      createdAt: Date.now(),
    },
  };
}
