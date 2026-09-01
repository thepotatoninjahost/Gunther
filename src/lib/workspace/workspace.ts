import type {
  ChangeRecord,
  ChangeSet,
  FileMap,
  OperationKind,
  RollbackResult,
  SearchHit,
  TaskOperation,
  VerificationIssue,
  VerificationReport,
} from "@/lib/agent/types";
import { uid } from "@/lib/utils";
import { MISSING_CHECKSUM, safePath, sha256Hex } from "./checksum";
import { countOccurrences } from "./diff";
import { inspectFile, scanUnfinished } from "./integrity";

type Staged = {
  operation: OperationKind;
  before: string | null;
  after: string | null;
};

/**
 * Single project file map. MutationCoordinator must share this instance —
 * never construct a second workspace for the same root.
 */
export class ProjectWorkspace {
  private files: FileMap;

  constructor(files: FileMap = {}) {
    this.files = { ...files };
  }

  snapshot(): FileMap {
    return { ...this.files };
  }

  replaceAll(files: FileMap) {
    this.files = { ...files };
  }

  list(dir = ""): string[] {
    const prefix = dir ? `${safePath(dir)}/` : "";
    return Object.keys(this.files)
      .filter((path) => (prefix ? path.startsWith(prefix) : true))
      .sort();
  }

  writeOwner(path: string, text: string) {
    this.files[safePath(path)] = text;
  }

  exists(path: string): boolean {
    return safePath(path) in this.files;
  }

  read(path: string): string {
    const key = safePath(path);
    const content = this.files[key];
    if (content == null) throw new Error(`File does not exist: ${path}`);
    return content;
  }

  search(query: string): SearchHit[] {
    const needle = query.trim();
    if (!needle) return [];
    const hits: SearchHit[] = [];
    const lower = needle.toLowerCase();
    for (const [path, content] of Object.entries(this.files)) {
      content.split("\n").forEach((line, index) => {
        if (line.toLowerCase().includes(lower)) {
          hits.push({ path, line: index + 1, text: line.trim() });
        }
      });
    }
    return hits.slice(0, 80);
  }

  summary(): { files: number; languages: Record<string, number>; bytes: number } {
    const languages: Record<string, number> = {};
    let bytes = 0;
    for (const [path, content] of Object.entries(this.files)) {
      bytes += content.length;
      const ext = path.split(".").pop()?.toLowerCase() || "other";
      languages[ext] = (languages[ext] ?? 0) + 1;
    }
    return { files: Object.keys(this.files).length, languages, bytes };
  }

  verify(): VerificationReport {
    const issues: VerificationIssue[] = [];
    for (const [path, content] of Object.entries(this.files)) {
      issues.push(...scanUnfinished(path, content));
    }
    return { passed: issues.length === 0, issues };
  }

  async verifyProposal(changeSet: ChangeSet): Promise<VerificationReport> {
    const issues: VerificationIssue[] = [];
    for (const change of changeSet.changes) {
      if (change.after != null) {
        issues.push(...(await inspectFile(change.path, change.after, change.afterChecksum)));
        issues.push(...scanUnfinished(change.path, change.after));
      }
    }
    return { passed: issues.length === 0, issues };
  }

  async preview(operations: TaskOperation[], reason: string): Promise<ChangeSet> {
    if (!operations.length) throw new Error("At least one operation is required");
    const staged = new Map<string, Staged>();
    const disk = (path: string) => this.files[path] ?? null;

    for (const op of operations) {
      const path = safePath(op.path);
      const current = staged.get(path)?.after ?? disk(path);
      if (op.kind === "CREATE") {
        if (current != null) throw new Error(`File already exists: ${path}`);
        if (op.text == null) throw new Error(`Create requires text: ${path}`);
        staged.set(path, { operation: "CREATE", before: null, after: op.text });
      } else if (op.kind === "REPLACE") {
        if (current == null) throw new Error(`File does not exist: ${path}`);
        if (!op.oldText) throw new Error("Replacement target cannot be empty");
        if (op.newText == null) throw new Error("Replacement needs new text");
        if (countOccurrences(current, op.oldText) !== 1) {
          throw new Error(`Expected exactly one match in ${path}`);
        }
        staged.set(path, {
          operation: "REPLACE",
          before: disk(path),
          after: current.replace(op.oldText, op.newText),
        });
      } else if (op.kind === "APPEND") {
        if (current == null) throw new Error(`File does not exist: ${path}`);
        const text = (op.text ?? "").trimEnd() + "\n";
        staged.set(path, {
          operation: "APPEND",
          before: disk(path),
          after: current + text,
        });
      } else if (op.kind === "REMOVE") {
        if (current == null) throw new Error(`File does not exist: ${path}`);
        if (!op.oldText) throw new Error("Removal target cannot be empty");
        if (countOccurrences(current, op.oldText) !== 1) {
          throw new Error(`Expected exactly one match in ${path}`);
        }
        staged.set(path, {
          operation: "REMOVE",
          before: disk(path),
          after: current.replace(op.oldText, ""),
        });
      }
    }

    const changes: ChangeRecord[] = [];
    for (const [path, stage] of staged) {
      const beforeChecksum = stage.before == null ? MISSING_CHECKSUM : await sha256Hex(stage.before);
      const afterChecksum = stage.after == null ? MISSING_CHECKSUM : await sha256Hex(stage.after);
      changes.push({
        path,
        operation: stage.operation,
        before: stage.before,
        after: stage.after,
        reason,
        beforeChecksum,
        afterChecksum,
      });
    }
    return { id: uid("cs"), changes, createdAt: Date.now(), reason };
  }

  async applyApproved(changeSet: ChangeSet): Promise<ChangeSet> {
    if (!changeSet.changes.length) throw new Error("Approved change set is empty");
    for (const record of changeSet.changes) {
      const current = this.files[record.path] ?? null;
      const currentChecksum = current == null ? MISSING_CHECKSUM : await sha256Hex(current);
      if (currentChecksum !== record.beforeChecksum) {
        throw new Error(`Approved content changed before apply: ${record.path}`);
      }
    }
    const written: ChangeRecord[] = [];
    try {
      for (const record of changeSet.changes) {
        if (record.after == null) delete this.files[record.path];
        else this.files[record.path] = record.after;
        const onDisk = this.files[record.path] ?? null;
        const onDiskChecksum = onDisk == null ? MISSING_CHECKSUM : await sha256Hex(onDisk);
        if (onDiskChecksum !== record.afterChecksum) {
          throw new Error(`Integrity: disk SHA-256 does not match staged afterChecksum: ${record.path}`);
        }
        if (onDisk != null) {
          const integrity = await inspectFile(record.path, onDisk, record.afterChecksum);
          if (integrity.length) {
            throw new Error(`Integrity: applied file failed checks: ${integrity.map((i) => i.message).join("; ")}`);
          }
        }
        written.push(record);
      }
      return changeSet;
    } catch (error) {
      for (const record of [...written].reverse()) {
        if (record.before == null) delete this.files[record.path];
        else this.files[record.path] = record.before;
      }
      throw error;
    }
  }

  async rollback(changeSet: ChangeSet): Promise<RollbackResult> {
    for (const record of changeSet.changes) {
      const current = this.files[record.path] ?? null;
      const currentChecksum = current == null ? MISSING_CHECKSUM : await sha256Hex(current);
      if (currentChecksum !== record.afterChecksum) {
        return {
          kind: "rejected",
          reason: `Rollback rejected — ${record.path} changed after the transaction`,
        };
      }
    }
    for (const record of [...changeSet.changes].reverse()) {
      if (record.before == null) delete this.files[record.path];
      else this.files[record.path] = record.before;
    }
    return { kind: "restored" };
  }
}
