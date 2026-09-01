export function unifiedDiff(path: string, before: string | null, after: string | null): string {
  if (before == null && after != null) {
    return [`--- /dev/null`, `+++ ${path}`, ...after.split("\n").map((l) => `+${l}`)].join("\n");
  }
  if (after == null && before != null) {
    return [`--- ${path}`, `+++ /dev/null`, ...before.split("\n").map((l) => `-${l}`)].join("\n");
  }
  const a = (before ?? "").split("\n");
  const b = (after ?? "").split("\n");
  const ops = diffOps(a, b);
  const lines = [`--- ${path}`, `+++ ${path}`];
  for (const op of ops) {
    if (op.type === "eq") lines.push(` ${op.line}`);
    else if (op.type === "del") lines.push(`-${op.line}`);
    else lines.push(`+${op.line}`);
  }
  return lines.join("\n");
}

type DiffOp = { type: "eq" | "del" | "add"; line: string };

function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i += 1;
    } else {
      ops.push({ type: "add", line: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "del", line: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "add", line: b[j] });
    j += 1;
  }
  return collapseEquals(ops);
}

function collapseEquals(ops: DiffOp[]): DiffOp[] {
  const changed = new Set<number>();
  ops.forEach((op, idx) => {
    if (op.type !== "eq") {
      for (let k = idx - 2; k <= idx + 2; k++) if (k >= 0) changed.add(k);
    }
  });
  const out: DiffOp[] = [];
  let omitted = 0;
  ops.forEach((op, idx) => {
    if (op.type !== "eq" || changed.has(idx)) {
      if (omitted) {
        out.push({ type: "eq", line: `… ${omitted} unchanged line(s)` });
        omitted = 0;
      }
      out.push(op);
    } else {
      omitted += 1;
    }
  });
  if (omitted) out.push({ type: "eq", line: `… ${omitted} unchanged line(s)` });
  return out;
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}
