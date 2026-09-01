export type KnowledgeChunk = {
  document: string;
  section: string;
  text: string;
};

/**
 * Pre-chunked reference material. Loaded on demand by section instead of
 * one monolithic asset.
 */
export const KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  {
    document: "coding-agent-handbook",
    section: "evidence-first",
    text: `Never invent file paths or contents. List, search, or read the project before analysis. If the user names a file, read it. A confident answer without evidence is a defect. When tools return nothing, say so — do not fabricate a repository.`,
  },
  {
    document: "coding-agent-handbook",
    section: "transactional-edits",
    text: `Code changes are staged as CREATE, REPLACE, APPEND, or REMOVE operations. REPLACE and REMOVE require exactly one match of the old text. Dual owner approval is required before a write hits the project copy. Checksums of before and after bytes guard apply and rollback. If the file changed after staging, apply and rollback both fail closed.`,
  },
  {
    document: "coding-agent-handbook",
    section: "verification",
    text: `Verification is a static unfinished-work scan for TODO, FIXME, and IMPLEMENT_ME markers plus integrity checks (NUL bytes, placeholder 'rest unchanged' comments, checksum mismatch). A pass means the bytes were inspected. It is not a compiler. Never report a fake pass. If markers remain, verification failed.`,
  },
  {
    document: "coding-agent-handbook",
    section: "debugging",
    text: `Reproduce from evidence. Read the failing function, search for callers, then state the concrete defect (wrong operator, missing guard, silent coercion). Propose the smallest REPLACE that fixes it. Do not rewrite the file. Do not leave TODO markers in the patch.`,
  },
  {
    document: "coding-agent-handbook",
    section: "typescript",
    text: `Prefer explicit types at module boundaries. Do not use any. Validate numeric input with Number.isFinite. Reject empty strings at the edge. Keep functions small and named for the business verb (withdraw, add, formatCents). Tests should name the behavior, not the method.`,
  },
  {
    document: "coding-agent-handbook",
    section: "money-and-ledgers",
    text: `Store money as integer cents. Never use floating-point for balances. Credits are positive, debits negative. withdraw must reject non-finite, non-positive, and overdraft amounts. add must reject non-finite amounts. formatCents must preserve a leading minus for negatives. parseDollars must fail closed on NaN rather than coerce to 0.`,
  },
  {
    document: "coding-agent-handbook",
    section: "api-design",
    text: `Functions throw or return a tagged result — pick one per module and stay consistent. Do not throw for expected domain cases if the rest of the module uses result objects. Document the failure. Keep path parameters project-relative. Never accept '..' in user-supplied paths.`,
  },
  {
    document: "coding-agent-handbook",
    section: "code-review",
    text: `A useful review names files, lines, and the consequence. Prefer: 'src/ledger.ts withdraw allows balance below zero' over 'consider adding validation'. After reading the project, write the answer. Do not keep listing files.`,
  },
  {
    document: "coding-agent-handbook",
    section: "research",
    text: `Use local knowledge search for engineering practice already in the handbook. Use web research when you lack current APIs, error messages, or library versions. Empty research fails closed — do not guess an external API. Prefer project files over invented local paths.`,
  },
  {
    document: "coding-agent-handbook",
    section: "stop-conditions",
    text: `Persist until the goal is met. Stop early only when a specific missing input from the owner is required that tools cannot supply. Do not stop because a change needs approval — stage the proposal and hand it to the owner. The owner confirms twice in Review.`,
  },
];
