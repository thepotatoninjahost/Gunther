import type { FileMap } from "@/lib/agent/types";

export const STARTER_NAME = "pulse-ledger";

export const STARTER_FILES: FileMap = {
  "README.md": `# Pulse Ledger

Tiny in-memory ledger used as the default workspace for Coding Agent.

Known issues you can ask the agent to fix:

- \`withdraw\` does not reject overdrafts
- \`add\` accepts non-finite amounts
- \`src/format.ts\` still has unfinished work markers

Try:

- What's in this project?
- Find bugs in the ledger
- Add overdraft protection to withdraw
`,
  "package.json": `{
  "name": "pulse-ledger",
  "private": true,
  "type": "module",
  "version": "0.1.0"
}
`,
  "src/index.ts": `export { Ledger } from "./ledger";
export { formatCents } from "./format";
`,
  "src/ledger.ts": `export type Entry = {
  id: string;
  at: string;
  amount: number;
  note: string;
};

export class Ledger {
  private entries: Entry[] = [];

  add(amount: number, note: string): Entry {
    const entry: Entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      amount,
      note,
    };
    this.entries.push(entry);
    return entry;
  }

  withdraw(amount: number, note: string): Entry {
    return this.add(-Math.abs(amount), note);
  }

  balance(): number {
    return this.entries.reduce((sum, entry) => sum + entry.amount, 0);
  }

  history(): Entry[] {
    return [...this.entries];
  }
}
`,
  "src/format.ts": `export function formatCents(cents: number): string {
  // TODO: handle negative values with a leading minus, not a wrapped sign.
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return \`$\${dollars}.\${rest}\`;
}

export function parseDollars(input: string): number {
  // FIXME: this silently turns "abc" into 0.
  return Math.round(Number(input) * 100);
}
`,
  "src/ledger.test.ts": `import { Ledger } from "./ledger";

export function runSmoke(): string[] {
  const log: string[] = [];
  const ledger = new Ledger();
  ledger.add(500, "seed");
  ledger.withdraw(200, "coffee");
  log.push(\`balance=\${ledger.balance()}\`);
  return log;
}
`,
};

export function cloneStarter(): FileMap {
  return { ...STARTER_FILES };
}
