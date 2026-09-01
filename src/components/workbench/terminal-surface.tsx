import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TerminalEntry } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

export function TerminalSurface({
  command,
  onCommand,
  history,
  running,
  onRun,
  onClear,
}: {
  command: string;
  onCommand: (value: string) => void;
  history: TerminalEntry[];
  running: boolean;
  onRun: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">Terminal</h2>
          <p className="font-mono text-[11px] text-muted">try: help · ls · cat README.md</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={!history.length}>
          Clear
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Commands run against the imported project copy. File writes are rejected — mutations still
        go through dual owner approval.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
      >
        <Input
          value={command}
          onChange={(e) => onCommand(e.target.value)}
          placeholder="ls"
          disabled={running}
          className="font-mono"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <Button type="submit" disabled={running || !command.trim()}>
          Run
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {[...history].reverse().map((entry) => (
            <pre
              key={entry.id}
              className={cn(
                "overflow-x-auto rounded-lg border bg-bg p-3 font-mono text-[12px] leading-5",
                entry.exitCode === 0 ? "border-border text-accent" : "border-danger/40 text-danger",
              )}
            >
              {`$ ${entry.command}\n${entry.stdout}${entry.stderr ? `\n${entry.stderr}` : ""}\nexit=${entry.exitCode}  ${entry.durationMs}ms`}
            </pre>
          ))}
        </div>
      </div>
    </div>
  );
}
