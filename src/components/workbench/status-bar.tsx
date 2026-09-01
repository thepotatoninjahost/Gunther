import { FolderInput, Plus, Settings, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentStatus } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<AgentStatus, "accent" | "warn" | "danger" | "muted"> = {
  ready: "accent",
  planning: "warn",
  researching: "warn",
  working: "warn",
  model: "warn",
  tool: "warn",
  editing: "warn",
  approval: "warn",
  running: "warn",
  failed: "danger",
  stopped: "danger",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  ready: "Ready",
  planning: "Planning",
  researching: "Researching",
  working: "Working",
  model: "Model",
  tool: "Tool",
  editing: "Editing",
  approval: "Waiting for approval",
  running: "Verifying",
  failed: "Failed",
  stopped: "Stopped",
};

export function StatusBar({
  status,
  detail,
  projectName,
  modelStatus,
  running,
  onNew,
  onImport,
  onSettings,
  onStop,
}: {
  status: AgentStatus;
  detail: string;
  projectName: string;
  modelStatus: string;
  running: boolean;
  onNew: () => void;
  onImport: () => void;
  onSettings: () => void;
  onStop: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-border bg-surface px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display text-sm font-semibold tracking-[0.18em] text-accent">
              CODING AGENT
            </p>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted">
            {projectName} · {modelStatus}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {running ? (
            <Button variant="danger" size="sm" onClick={onStop} aria-label="Stop">
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onSettings} aria-label="Settings">
            <Settings className="size-4" />
            <span className="hidden sm:inline">Model</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onNew} aria-label="New project">
            <Plus className="size-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onImport} aria-label="Import project">
            <FolderInput className="size-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
        </div>
      </div>
      <p className={cn("mt-2 truncate font-mono text-xs", running ? "text-warn" : "text-muted")}>
        {detail}
      </p>
    </header>
  );
}
