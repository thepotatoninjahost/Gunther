import type { VerificationIssue } from "@/lib/agent/types";
import { sha256Hex } from "./checksum";

const SOURCE_EXT = new Set([
  "kt",
  "kts",
  "java",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "mjs",
  "cjs",
  "json",
  "md",
  "css",
  "html",
]);

const PLACEHOLDER =
  /^\s*(?:\/\/|#|\/\*|\*|<!--)?\s*(?:\.\.\.|…)?\s*(?:rest unchanged|existing code(?: here)?|code unchanged|remainder (?:of (?:the )?file )?omitted|rest of (?:the )?file|unchanged below|insert(?: the)? rest|snip(?:ped)?)\b/i;

export function isSourcePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return SOURCE_EXT.has(ext);
}

export async function inspectFile(
  path: string,
  content: string,
  expectedChecksum?: string,
): Promise<VerificationIssue[]> {
  const issues: VerificationIssue[] = [];
  if (content.includes("\u0000")) {
    issues.push({ path, line: 0, message: "integrity: NUL byte in file" });
  }
  if (expectedChecksum && expectedChecksum !== "<missing>") {
    const actual = await sha256Hex(content);
    if (actual !== expectedChecksum) {
      issues.push({
        path,
        line: 0,
        message: `integrity: SHA-256 mismatch expected=${expectedChecksum.slice(0, 12)}… actual=${actual.slice(0, 12)}…`,
      });
    }
  }
  content.split("\n").forEach((line, index) => {
    if (PLACEHOLDER.test(line)) {
      issues.push({
        path,
        line: index + 1,
        message: "integrity: placeholder / omitted-code marker",
      });
    }
  });
  return issues;
}

const TODO = "TO" + "DO";
const FIXME = "FIX" + "ME";
const STUB = "IMP" + "LEMENT_ME";

export function scanUnfinished(path: string, content: string): VerificationIssue[] {
  if (!isSourcePath(path)) return [];
  const issues: VerificationIssue[] = [];
  content.split("\n").forEach((line, index) => {
    if (line.includes(TODO)) issues.push({ path, line: index + 1, message: `${TODO} marker` });
    if (line.includes(FIXME)) issues.push({ path, line: index + 1, message: `${FIXME} marker` });
    if (line.includes(STUB)) issues.push({ path, line: index + 1, message: `${STUB} marker` });
  });
  return issues;
}
