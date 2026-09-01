import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage, PendingChangeProposal } from "@/lib/agent/types";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "./approval-card";

const STARTERS = [
  "What's in this project?",
  "Find bugs in the ledger",
  "Add overdraft protection to withdraw",
];

export function ChatSurface({
  messages,
  input,
  onInput,
  onSend,
  busy,
  pending,
  onApprove,
}: {
  messages: ChatMessage[];
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  pending: PendingChangeProposal | null;
  onApprove: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-lg py-10">
            <h2 className="font-display text-xl font-semibold text-fg text-balance">
              Evidence first. Then a patch.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
              Ask in plain English. The agent reads this project, stages a transactional
              change, and waits for two owner confirmations before writing.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onInput(prompt)}
                  className="rounded-lg border border-border bg-raised px-4 py-3 text-left text-sm text-fg hover:border-accent/40"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {busy ? (
              <p className="font-mono text-xs text-warn">Agent is working…</p>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>
      {pending ? (
        <div className="px-4 pb-2">
          <ApprovalCard
            approvalCount={pending.approvals.length}
            reason={pending.changeSet.reason}
            onApprove={onApprove}
          />
        </div>
      ) : null}
      <div className="border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <Textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Describe what you want fixed or added…"
            rows={4}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">⌘ / Ctrl + Enter</p>
            <Button onClick={onSend} disabled={!input.trim() || busy} className="min-w-28">
              {busy ? "Working" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  return (
    <div className={cn("flex", user ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-lg border px-3 py-2.5",
          user ? "border-accent/35 bg-user" : "border-border bg-raised",
        )}
      >
        <p
          className={cn(
            "font-mono text-[10px] font-medium uppercase tracking-[0.16em]",
            user ? "text-accent" : "text-warn",
          )}
        >
          {user ? "You" : message.role === "agent" ? "Agent" : "System"}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg">{message.content}</p>
      </div>
    </div>
  );
}
