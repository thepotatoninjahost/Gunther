import { useState } from "react";
import { FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FileMap } from "@/lib/agent/types";

export function FilesSurface({
  files,
  filter,
  onFilter,
  path,
  draft,
  onOpen,
  onDraft,
  onRevert,
  onPropose,
  onCreate,
  onClose,
}: {
  files: FileMap;
  filter: string;
  onFilter: (value: string) => void;
  path: string;
  draft: string;
  onOpen: (path: string) => void;
  onDraft: (value: string) => void;
  onRevert: () => void;
  onPropose: () => void;
  onCreate: (path: string) => void;
  onClose: () => void;
}) {
  const [newPath, setNewPath] = useState("");
  const names = Object.keys(files)
    .sort()
    .filter((name) => name.toLowerCase().includes(filter.trim().toLowerCase()));
  const original = path ? files[path] : undefined;
  const dirty = path !== "" && original != null && original !== draft;

  if (path) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden gap-3 p-4">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-warn">{path}</p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none font-mono text-[13px] leading-5"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRevert} disabled={!dirty}>
            Revert
          </Button>
          <Button onClick={onPropose} disabled={!dirty} className="flex-1">
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden gap-3 p-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Project files</h2>
        <p className="mt-1 text-xs text-muted">
          Your files. Create one here, import from the folder button, or ask the agent to write it.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!newPath.trim()) return;
          onCreate(newPath.trim());
          setNewPath("");
        }}
      >
        <Input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder="src/app.py"
          className="font-mono"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <Button type="submit" disabled={!newPath.trim()}>
          New
        </Button>
      </form>
      <Input value={filter} onChange={(e) => onFilter(e.target.value)} placeholder="Filter files" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {names.length === 0 ? (
          <Empty
            title="No files yet"
            body="Type a name above and tap New, or import files from this phone."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {names.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onOpen(name)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-raised px-3 py-3 text-left hover:border-accent/40"
                >
                  <FileCode2 className="size-4 shrink-0 text-warn" />
                  <span className="truncate font-mono text-[13px] text-fg">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-2 py-10 text-center">
      <p className="font-medium text-fg">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
