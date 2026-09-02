import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_INSTRUCTION_SHEET } from "@/lib/agent/prompt";

const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

const PRESETS = [
  { label: "Qwen3 32B · Groq free", endpoint: GROQ, model: "qwen/qwen3-32b" },
  { label: "Llama 3.3 70B · Groq free", endpoint: GROQ, model: "llama-3.3-70b-versatile" },
  { label: "Qwen3 Coder 480B · OpenRouter free", endpoint: OPENROUTER, model: "qwen/qwen3-coder:free" },
];

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
  const [model, setModel] = useState(() => {
    try {
      return bridge?.getModel() || PRESETS[0].model;
    } catch {
      return PRESETS[0].model;
    }
  });

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
            <p className="mt-1 text-sm text-fg">Open-weight server models. Not Grok. Not on-device 8B.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Groq hosts Llama and Qwen for free (no credit card). OpenRouter hosts Qwen3 Coder 480B
              on a free route. Paste that key. It stays on this phone.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.model}
                  type="button"
                  className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm ${
                    model === preset.model
                      ? "border-accent bg-user text-fg"
                      : "border-border bg-raised text-fg"
                  }`}
                  onClick={() => {
                    setModel(preset.model);
                    bridge?.setGateway(preset.endpoint, preset.model);
                    onProbe();
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {bridge ? (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = keyDraft.trim();
                  if (!next) return;
                  const preset = PRESETS.find((p) => p.model === model) ?? PRESETS[0];
                  bridge.setGateway(preset.endpoint, preset.model);
                  bridge.setApiKey(next);
                  setKeyDraft("");
                  setKeySaved(true);
                  onProbe();
                }}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={model.includes("coder") ? "sk-or-…" : "gsk_…"}
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  aria-label="API key"
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
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Groq: console.groq.com/keys · OpenRouter: openrouter.ai/keys
            </p>
            <p className="mt-2 font-mono text-xs text-accent">
              {aiAvailable == null ? "Checking…" : aiAvailable ? `Ready · ${model}` : "No key yet"}
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
