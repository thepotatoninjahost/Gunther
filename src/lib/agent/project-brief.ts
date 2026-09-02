import type { FileMap } from "./types";
import type { ProjectWorkspace } from "@/lib/workspace/workspace";

/**
 * ONE JOB: Build an evidence-only project brief from the mounted workspace
 * so inspect/review/improve still answer when the cloud model returns nothing.
 */
export function projectBrief(workspace: ProjectWorkspace, files: FileMap, request: string): string {
  const paths = Object.keys(files).sort();
  const summary = workspace.summary();
  const langs = Object.entries(summary.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => `${ext}=${count}`)
    .join(", ");
  const report = workspace.verify();
  const listed = paths.slice(0, 80);
  const extra = paths.length > 80 ? `\n… and ${paths.length - 80} more` : "";

  if (!paths.length) {
    return [
      "No files are mounted.",
      "Import a folder from this phone, then ask again.",
      request ? `Request was: ${request}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const hints = improvementHints(files, report.issues.length);
  return [
    `Mounted ${summary.files} file(s), ${summary.bytes} bytes. Languages: ${langs || "none"}.`,
    "",
    "Paths:",
    listed.join("\n") + extra,
    "",
    `Verification (unfinished-work scan): ${
      report.passed ? "passed" : `FAILED (${report.issues.length} issue(s))`
    }`,
    ...report.issues.slice(0, 16).map((issue) => `- ${issue.path}:${issue.line} — ${issue.message}`),
    report.issues.length > 16 ? `- … ${report.issues.length - 16} more` : "",
    "",
    hints.length ? "Local observations:" : "",
    ...hints.map((hint, index) => `${index + 1}. ${hint}`),
    "",
    "This brief is from the mounted files on device. Name a path to read it, or ask for a specific patch.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function improvementHints(files: FileMap, unfinished: number): string[] {
  const paths = Object.keys(files);
  const hints: string[] = [];
  const hasTests = paths.some((path) => /\.(test|spec)\./i.test(path) || /\/__tests__\//i.test(path));
  const hasReadme = paths.some((path) => /(^|\/)README(\.md)?$/i.test(path));
  const huge = paths.filter((path) => (files[path]?.length ?? 0) > 20_000).slice(0, 6);
  if (unfinished) {
    hints.push(`Clear the ${unfinished} TODO/FIXME/IMPLEMENT_ME marker(s) the scanner already found.`);
  }
  if (!hasTests) hints.push("No test files are indexed. Add a focused test next to the code you change.");
  if (!hasReadme) hints.push("No README is indexed. A short owner-facing README would document how to run this.");
  if (huge.length) {
    hints.push(`These files are large for an on-device review: ${huge.join(", ")}. Split by job before editing.`);
  }
  if (paths.some((path) => path.startsWith("src/lib/agent/")) && paths.some((path) => path.includes("llm-spa"))) {
    hints.push(
      "Agent chat depends on the OpenRouter hop. Inspect/review should keep working from this local brief when that hop is empty.",
    );
  }
  return hints.slice(0, 6);
}
