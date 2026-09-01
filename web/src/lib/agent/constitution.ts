export type ConstitutionRule =
  | "OWNER_LOCK"
  | "DEFAULT_NO"
  | "CLEAR_PERMISSION"
  | "DOUBLE_CONFIRMATION"
  | "SANDBOX_FIRST"
  | "TRANSPARENCY_LOG"
  | "IMMEDIATE_STOP"
  | "PERMISSION_EXPIRATION"
  | "NO_SILENT_BACKGROUND_POWER"
  | "DATA_LOYALTY"
  | "ANTI_IMPERSONATION"
  | "SAFETY_BOUNDARY";

export type AgentActionCategory =
  | "CODE_CHANGE"
  | "MODEL_CHANGE"
  | "SETTINGS_CHANGE"
  | "DATA_EXPORT"
  | "DATA_SHARE"
  | "READ_ONLY";

export type AgentAction = {
  description: string;
  category: AgentActionCategory;
  silent?: boolean;
  ownerVerified?: boolean;
  approvalCount?: number;
  sandboxPassed?: boolean;
  explicitShareApproval?: boolean;
  voiceInitiated?: boolean;
  clearPermission?: boolean;
  lockdown?: boolean;
};

export type ConstitutionViolation = {
  rule: ConstitutionRule;
  message: string;
  blocking: boolean;
};

export const APPROVAL_EXPIRATION_MS = 30 * 60 * 1000;

const DOUBLE_CONFIRM = new Set<AgentActionCategory>([
  "CODE_CHANGE",
  "MODEL_CHANGE",
  "SETTINGS_CHANGE",
  "DATA_EXPORT",
  "DATA_SHARE",
]);

export function checkConstitution(
  action: AgentAction,
  now = Date.now(),
  approvalAt?: number,
): ConstitutionViolation[] {
  if (action.lockdown && action.category !== "READ_ONLY") {
    return [{ rule: "IMMEDIATE_STOP", message: "Lockdown is active", blocking: true }];
  }
  if (action.category === "READ_ONLY") return [];

  const violations: ConstitutionViolation[] = [];
  if (!action.ownerVerified) {
    violations.push({ rule: "OWNER_LOCK", message: "Owner verification is required", blocking: true });
  }
  if (!action.approvalCount) {
    violations.push({ rule: "DEFAULT_NO", message: "No explicit approval was recorded", blocking: true });
  }
  if (action.clearPermission === false) {
    violations.push({
      rule: "CLEAR_PERMISSION",
      message: "The requested permission is not explicit",
      blocking: true,
    });
  }
  if (action.category === "CODE_CHANGE" && !action.sandboxPassed) {
    violations.push({
      rule: "SANDBOX_FIRST",
      message: "Code changes require a passing evaluation",
      blocking: true,
    });
  }
  if (action.category === "MODEL_CHANGE" && !action.sandboxPassed) {
    violations.push({
      rule: "SANDBOX_FIRST",
      message: "Model changes require a passing evaluation",
      blocking: true,
    });
  }
  if (action.silent) {
    violations.push({
      rule: "NO_SILENT_BACKGROUND_POWER",
      message: "The action must be visible in the activity log",
      blocking: true,
    });
  }
  if (action.category === "DATA_SHARE" && !action.explicitShareApproval) {
    violations.push({
      rule: "DATA_LOYALTY",
      message: "Data sharing needs per-connection approval",
      blocking: true,
    });
  }
  if (action.voiceInitiated && DOUBLE_CONFIRM.has(action.category)) {
    violations.push({
      rule: "ANTI_IMPERSONATION",
      message: "Voice-initiated critical changes need owner verification",
      blocking: true,
    });
  }
  if (DOUBLE_CONFIRM.has(action.category) && (action.approvalCount ?? 0) < 2) {
    violations.push({
      rule: "DOUBLE_CONFIRMATION",
      message: "This action requires two approvals",
      blocking: true,
    });
  }
  if (approvalAt != null && now - approvalAt > APPROVAL_EXPIRATION_MS) {
    violations.push({
      rule: "PERMISSION_EXPIRATION",
      message: "The approval has expired",
      blocking: true,
    });
  }
  return [...new Map(violations.map((v) => [v.rule, v])).values()];
}

export function isAllowed(
  action: AgentAction,
  now = Date.now(),
  approvalAt?: number,
): boolean {
  return checkConstitution(action, now, approvalAt).every((v) => !v.blocking);
}
