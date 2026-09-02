import type { FileMap } from "./types";
import type { ProjectWorkspace } from "@/lib/workspace/workspace";
import type { MutationCoordinator } from "@/lib/workspace/mutations";
import { projectBrief } from "./project-brief";

export type DirectLane =
  | { handled: true; reply: string; proposalId?: string }
  | { handled: false };

export async function tryDirectLane(
  request: string,
  workspace: ProjectWorkspace,
  files: FileMap,
  mutations: MutationCoordinator,
): Promise<DirectLane> {
  const text = request.trim();
  if (!text) return { handled: true, reply: "A coding request is required." };

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(text) && text.length < 48) {
    return {
      handled: true,
      reply:
        "Ready. Import a folder or ask me to list files, review the project, find bugs, or stage a patch — writes still need owner confirmation.",
    };
  }

  if (isStatus(text)) {
    const summary = workspace.summary();
    const langs = Object.entries(summary.languages)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const report = workspace.verify();
    return {
      handled: true,
      reply: `Mounted. ${summary.files} files, ${summary.bytes} bytes. Languages: ${langs || "none"}.\nVerification: ${
        report.passed ? "passed" : `FAILED (${report.issues.length} issue(s))`
      }.`,
    };
  }

  if (isListing(text) || isReview(text)) {
    return { handled: true, reply: projectBrief(workspace, files, text) };
  }

  const read = text.match(/^read\s+(\S+)$/i);
  if (read) {
    try {
      return { handled: true, reply: workspace.read(read[1]) };
    } catch (error) {
      return { handled: true, reply: error instanceof Error ? error.message : "Read failed" };
    }
  }

  if (/^(verify|scan|unfinished)\b/i.test(text)) {
    const report = workspace.verify();
    const issues = report.issues.map((i) => `${i.path}:${i.line}: ${i.message}`).join("\n");
    return { handled: true, reply: `passed=${report.passed}\n${issues}` };
  }

  if (isBugHunt(text) && files["src/ledger.ts"]) {
    return { handled: true, reply: reviewLedger(workspace) };
  }

  if (isOverdraftAsk(text) && files["src/ledger.ts"]) {
    return stageOverdraft(workspace, mutations, text);
  }

  if (isFiniteGuardAsk(text) && files["src/ledger.ts"]) {
    return stageFiniteGuard(workspace, mutations, text);
  }

  return { handled: false };
}

function isStatus(text: string): boolean {
  return /^(status|what('?s| is) mounted|project status)\??$/i.test(text);
}

function isListing(text: string): boolean {
  return /^(list|ls|show files|what files|what'?s in this (project|repo)|what is in this (project|repo)|show (the )?project)\b/i.test(
    text,
  );
}

function isReview(text: string): boolean {
  return (
    /\b(review|inspect|look over|look at)\b[\s\S]{0,40}\b(project|files|repo|codebase|code)\b/i.test(text) ||
    /^(review|inspect)\b/i.test(text) ||
    /\bhow can we improve\b/i.test(text) ||
    /\bimprove(?:ment)?s?\b[\s\S]{0,40}\b(project|repo|codebase|this)\b/i.test(text)
  );
}

function isBugHunt(text: string): boolean {
  return /find bugs in the ledger/i.test(text);
}

function isOverdraftAsk(text: string): boolean {
  return /overdraft/i.test(text) || (/withdraw/i.test(text) && /protect|reject|guard|prevent/i.test(text));
}

function isFiniteGuardAsk(text: string): boolean {
  return /non-?finite|validate add|guard add/i.test(text);
}

function reviewLedger(workspace: ProjectWorkspace): string {
  const paths = ["src/ledger.ts", "src/format.ts", "src/ledger.test.ts", "README.md"];
  const present: string[] = [];
  const bodies: Record<string, string> = {};
  for (const path of paths) {
    try {
      bodies[path] = workspace.read(path);
      present.push(path);
    } catch {
      /* skip missing */
    }
  }
  const report = workspace.verify();
  const defects: string[] = [];
  const ledger = bodies["src/ledger.ts"] ?? "";
  if (ledger.includes("return this.add(-Math.abs(amount), note)")) {
    defects.push(
      "src/ledger.ts `withdraw` — posts a negative entry with no overdraft check. Balance can go below zero.",
    );
  }
  if (/add\(amount: number[\s\S]*this\.entries\.push/i.test(ledger) && !ledger.includes("Number.isFinite")) {
    defects.push("src/ledger.ts `add` — no Number.isFinite guard; NaN/Infinity amounts are stored.");
  }
  const format = bodies["src/format.ts"] ?? "";
  if (format.includes("return `$${dollars}.${rest}`") && !format.includes("cents < 0")) {
    defects.push("src/format.ts `formatCents` — negatives lose the leading minus (TODO on line 2).");
  }
  if (format.includes("Math.round(Number(input) * 100)") && !format.includes("Number.isFinite")) {
    defects.push('src/format.ts `parseDollars` — Number("abc") becomes 0 (FIXME on line 11).');
  }

  return [
    `Read ${present.join(", ") || "(no matching files)"}.`,
    "",
    `Verification: ${report.passed ? "passed (static unfinished-work scan)" : `FAILED (${report.issues.length} issue(s))`}`,
    ...report.issues.map((i) => `- ${i.path}:${i.line} — ${i.message}`),
    "",
    defects.length ? "Defects with evidence:" : "No additional defects matched the starter patterns.",
    ...defects.map((d, i) => `${i + 1}. ${d}`),
    "",
    "Ask me to patch any of these. The write stages a proposal — owner confirmation in Review applies it.",
  ].join("\n");
}

async function stageOverdraft(
  workspace: ProjectWorkspace,
  mutations: MutationCoordinator,
  request: string,
): Promise<DirectLane> {
  let current: string;
  try {
    current = workspace.read("src/ledger.ts");
  } catch {
    return { handled: false };
  }
  const oldText = `  withdraw(amount: number, note: string): Entry {
    return this.add(-Math.abs(amount), note);
  }`;
  if (!current.includes(oldText)) {
    return {
      handled: true,
      reply:
        "I read src/ledger.ts. The starter withdraw body is already changed, so I will not guess a patch. Open the file in Files or name the exact old text.",
    };
  }
  const newText = `  withdraw(amount: number, note: string): Entry {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("withdraw requires a positive finite amount");
    }
    if (this.balance() < amount) {
      throw new Error("overdraft rejected");
    }
    return this.add(-amount, note);
  }`;
  const proposed = await mutations.propose(
    request,
    [{ kind: "REPLACE", path: "src/ledger.ts", oldText, newText }],
    "Reject overdrafts in withdraw",
  );
  if (proposed.kind === "rejected") {
    return { handled: true, reply: `Could not stage the overdraft patch: ${proposed.reason}` };
  }
  return {
    handled: true,
    proposalId: proposed.proposal.id,
    reply: `Staged a REPLACE on src/ledger.ts. withdraw will reject non-finite, non-positive, and overdraft amounts. Confirm in Review (${proposed.proposal.id.slice(-8)}).`,
  };
}

async function stageFiniteGuard(
  workspace: ProjectWorkspace,
  mutations: MutationCoordinator,
  request: string,
): Promise<DirectLane> {
  let current: string;
  try {
    current = workspace.read("src/ledger.ts");
  } catch {
    return { handled: false };
  }
  const oldText = `  add(amount: number, note: string): Entry {
    const entry: Entry = {`;
  if (!current.includes(oldText)) return { handled: false };
  const newText = `  add(amount: number, note: string): Entry {
    if (!Number.isFinite(amount)) {
      throw new Error("add requires a finite amount");
    }
    const entry: Entry = {`;
  const proposed = await mutations.propose(
    request,
    [{ kind: "REPLACE", path: "src/ledger.ts", oldText, newText }],
    "Reject non-finite amounts in add",
  );
  if (proposed.kind === "rejected") {
    return { handled: true, reply: `Could not stage the add guard: ${proposed.reason}` };
  }
  return {
    handled: true,
    proposalId: proposed.proposal.id,
    reply: `Staged a REPLACE on src/ledger.ts so add rejects non-finite amounts. Confirm in Review (${proposed.proposal.id.slice(-8)}).`,
  };
}
