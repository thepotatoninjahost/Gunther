import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_INSTRUCTION_SHEET } from "@/lib/agent/prompt";

function phoneBridge() {
  if (typeof window === "undefined") return undefined;
  return window.GuntherNative;
}

function phoneHasKey(): boolean {
  const bridge = phoneBridge();
  if (!bridge) return false;
  try {
    return Boolean(bridge.hasKey());
  } catch {
    return false;
  }
}

export function SettingsPanel({
  open,
  instructionSheet,
  onSheet,
  aiAvailable,
  onClose,
  onClearChat,
  onProbe,
}: {
  open: boolean;
  instructionSheet: string;
  onSheet: (value: string) => void;
  aiAvailable: boolean | null;
  onClose: () => void;
  onClearChat: () => void;
  onProbe: () => void;
}) {
  const bridge = phoneBridge();
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaved, setKeySaved] = useState(() => phoneHasKey());

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-bg/70">
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface p-4 pb-[max(1rem,var(--kb,0px))] shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-fg">Model</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4 space-y-4 overflow-y-auto">
          <section className="rounded-lg border border-border bg-raised p-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Gateway</p>
            <p className="mt-1 text-sm text-fg">grok-4.5 · on this phone</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Paste an xAI API key. It is stored in this phone’s private storage, not in the
              installer, and it is never shown back to the screen.
            </p>
            {bridge ? (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = keyDraft.trim();
                  if (!next) return;
                  bridge.setApiKey(next);
                  setKeyDraft("");
                  setKeySaved(true);
                  onProbe();
                }}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="xai-…"
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  aria-label="xAI API key"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={!keyDraft.trim()}>
                    Save key
                  </Button>
                  {keySaved ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        bridge.clearApiKey();
                        setKeySaved(false);
                        setKeyDraft("");
                        onProbe();
                      }}
                    >
                      Remove key
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
            <p className="mt-2 font-mono text-xs text-accent">
              {aiAvailable == null ? "Checking…" : aiAvailable ? "Key saved · ready" : "No key yet"}
            </p>
          </section>
          <section>
            <p className="text-sm font-medium text-fg">Instruction sheet</p>
            <p className="mt-1 text-xs text-muted">
              You own these instructions. Empty / reset restores the built-in default. Stored only
              on this device.
            </p>
            <Textarea
              className="mt-2 min-h-48 font-mono text-xs"
              value={instructionSheet}
              onChange={(e) => onSheet(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => onSheet(DEFAULT_INSTRUCTION_SHEET)}
            >
              Reset to default
            </Button>
          </section>
          <Button variant="danger" onClick={onClearChat}>
            Clear chat history
          </Button>
        </div>
      </aside>
    </div>
  );
}
