import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage, PendingChangeProposal } from "@/lib/agent/types";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "./approval-card";

export function ChatSurface({
  messages,
  input,
  onInput,
  onSend,
  busy,
  pending,
  onApprove,
  onImport,
  fileCount,
}: {
  messages: ChatMessage[];
  input: string;
  onInput: (value: string) => void;
  onSend: (preset?: string) => void;
  busy: boolean;
  pending: PendingChangeProposal | null;
  onApprove: () => void;
  onImport: () => void;
  fileCount: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, busy, pending]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
        }}
      >
        {messages.length === 0 ? (
          <div className="mx-auto max-w-lg py-6">
            <h2 className="font-display text-xl font-semibold text-fg text-balance">
              Tell it what to build.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
              Import a folder or type a request. The agent writes a patch. You confirm it in Review.
            </p>
            <p className="mt-2 font-mono text-xs text-muted">
              {fileCount ? `${fileCount} file(s) mounted` : "Empty workspace"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={onImport}
              className="mt-6 min-h-11 w-full rounded-lg border border-border bg-raised px-4 py-3 text-left text-sm text-fg"
            >
              Import files from this phone
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {busy ? <p className="font-mono text-xs text-warn">Agent is working…</p> : null}
          </div>
        )}
      </div>
      {pending ? (
        <div className="shrink-0 px-4 pb-2">
          <ApprovalCard
            approvalCount={pending.approvals.length}
            reason={pending.changeSet.reason}
            onApprove={onApprove}
          />
        </div>
      ) : null}
      <form
        className="shrink-0 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,var(--kb,0px))]"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <div className="mx-auto max-w-2xl">
          <Textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Ask the agent to build, fix, or explain…"
            rows={2}
            enterKeyHint="send"
            autoComplete="off"
            className="min-h-16 resize-none text-base md:min-h-20"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-end">
            <Button type="submit" disabled={!input.trim() || busy} className="min-h-11 min-w-28">
              {busy ? "Working" : "Send"}
            </Button>
          </div>
        </div>
      </form>
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
