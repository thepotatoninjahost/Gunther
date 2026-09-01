export type OperationKind = "CREATE" | "REPLACE" | "APPEND" | "REMOVE";

export type TaskOperation = {
  kind: OperationKind;
  path: string;
  oldText?: string;
  newText?: string;
  text?: string;
};

export type ChangeRecord = {
  path: string;
  operation: OperationKind;
  before: string | null;
  after: string | null;
  reason: string;
  beforeChecksum: string;
  afterChecksum: string;
};

export type ChangeSet = {
  id: string;
  changes: ChangeRecord[];
  createdAt: number;
  reason: string;
};

export type VerificationIssue = {
  path: string;
  line: number;
  message: string;
};

export type VerificationReport = {
  passed: boolean;
  issues: VerificationIssue[];
};

export type SearchHit = {
  path: string;
  line: number;
  text: string;
};

export type KnowledgeHit = {
  document: string;
  section: string;
  score: number;
  excerpt: string;
};

export type ResearchHit = {
  title: string;
  excerpt: string;
  url: string;
};

export type ApprovalRecord = {
  actionId: string;
  approvedAt: number;
  ownerLabel: string;
  confirmationNumber: number;
};

export type PendingChangeProposal = {
  id: string;
  request: string;
  changeSet: ChangeSet;
  verification: VerificationReport;
  createdAt: number;
  expiresAt: number;
  approvals: ApprovalRecord[];
};

export type ProposeResult =
  | { kind: "proposed"; proposal: PendingChangeProposal }
  | { kind: "rejected"; reason: string };

export type MutationApprovalResult =
  | { kind: "awaiting-second"; proposal: PendingChangeProposal; approval: ApprovalRecord }
  | { kind: "applied"; proposal: PendingChangeProposal; changeSet: ChangeSet }
  | { kind: "rejected"; reason: string };

export type RollbackResult =
  | { kind: "restored" }
  | { kind: "rejected"; reason: string };

export type FileMap = Record<string, string>;

export type ChatRole = "user" | "agent" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type AgentEvent = {
  id: string;
  phase: string;
  detail: string;
  at: number;
};

export type TerminalEntry = {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  cwd: string;
};

export type AgentStatus =
  | "ready"
  | "planning"
  | "researching"
  | "working"
  | "model"
  | "tool"
  | "editing"
  | "approval"
  | "running"
  | "failed"
  | "stopped";

export type SurfaceTab = "chat" | "files" | "review" | "terminal" | "research";

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlmToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentTurnResult =
  | { ok: true; content: string | null; toolCalls: LlmToolCall[] }
  | { ok: false; error: string };

export type AiAvailability = { available: boolean };
