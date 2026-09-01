import { useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { useWorkbench } from "@/lib/store/workbench";
import { ChatSurface } from "./chat-surface";
import { FilesSurface } from "./files-surface";
import { ResearchSurface } from "./research-surface";
import { ReviewSurface } from "./review-surface";
import { SettingsPanel } from "./settings-panel";
import { StatusBar } from "./status-bar";
import { TabBar } from "./tab-bar";
import { TerminalSurface } from "./terminal-surface";

export function WorkbenchShell() {
  const fileRef = useRef<HTMLInputElement>(null);
  const tab = useWorkbench((s) => s.tab);
  const status = useWorkbench((s) => s.status);
  const detail = useWorkbench((s) => s.detail);
  const projectName = useWorkbench((s) => s.projectName);
  const running = useWorkbench((s) => s.running);
  const aiAvailable = useWorkbench((s) => s.aiAvailable);
  const chat = useWorkbench((s) => s.chat);
  const chatInput = useWorkbench((s) => s.chatInput);
  const files = useWorkbench((s) => s.files);
  const fileFilter = useWorkbench((s) => s.fileFilter);
  const editorPath = useWorkbench((s) => s.editorPath);
  const editorDraft = useWorkbench((s) => s.editorDraft);
  const pending = useWorkbench((s) => s.pending);
  const transactions = useWorkbench((s) => s.transactions);
  const terminalInput = useWorkbench((s) => s.terminalInput);
  const terminalHistory = useWorkbench((s) => s.terminalHistory);
  const researchQuery = useWorkbench((s) => s.researchQuery);
  const researchHits = useWorkbench((s) => s.researchHits);
  const researchError = useWorkbench((s) => s.researchError);
  const researchBusy = useWorkbench((s) => s.researchBusy);
  const settingsOpen = useWorkbench((s) => s.settingsOpen);
  const instructionSheet = useWorkbench((s) => s.instructionSheet);

  useEffect(() => {
    void (async () => {
      await useWorkbench.persist.rehydrate();
      useWorkbench.getState().hydrateEngine();
      await useWorkbench.getState().probe();
    })();
  }, []);

  const modelStatus =
    aiAvailable == null
      ? "model · checking"
      : aiAvailable
        ? "grok-4.5 · ready"
        : "grok-4.5 · unavailable";

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-bg text-fg">
      <div className="shrink-0">
        <StatusBar
          status={status}
          detail={detail}
          projectName={projectName}
          modelStatus={modelStatus}
          running={running}
          onNew={() => useWorkbench.getState().newProject()}
          onImport={() => fileRef.current?.click()}
          onSettings={() => useWorkbench.getState().setSettingsOpen(true)}
          onStop={() => useWorkbench.getState().stop()}
        />
      </div>
      <div className="hidden shrink-0 md:block">
        <TabBar
          tab={tab}
          onTab={(next) => useWorkbench.getState().setTab(next)}
          pendingCount={pending.length}
        />
      </div>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "chat" ? (
          <ChatSurface
            messages={chat}
            input={chatInput}
            onInput={(v) => useWorkbench.getState().setChatInput(v)}
            onSend={(preset) => void useWorkbench.getState().send(preset)}
            busy={running}
            pending={pending[0] ?? null}
            onApprove={() => void useWorkbench.getState().approve()}
          />
        ) : null}
        {tab === "files" ? (
          <FilesSurface
            files={files}
            filter={fileFilter}
            onFilter={(v) => useWorkbench.getState().setFileFilter(v)}
            path={editorPath}
            draft={editorDraft}
            onOpen={(p) => useWorkbench.getState().setEditorPath(p)}
            onDraft={(v) => useWorkbench.getState().setEditorDraft(v)}
            onRevert={() => {
              const current = useWorkbench.getState();
              if (current.editorPath && current.files[current.editorPath] != null) {
                current.setEditorDraft(current.files[current.editorPath]);
              }
            }}
            onPropose={() => void useWorkbench.getState().proposeEditorSave()}
            onClose={() => useWorkbench.setState({ editorPath: "", editorDraft: "" })}
          />
        ) : null}
        {tab === "review" ? (
          <ReviewSurface
            pending={pending[0] ?? null}
            transactions={transactions}
            onApprove={() => void useWorkbench.getState().approve()}
            onReject={() => useWorkbench.getState().reject()}
            onRollback={() => void useWorkbench.getState().rollbackLast()}
          />
        ) : null}
        {tab === "terminal" ? (
          <TerminalSurface
            command={terminalInput}
            onCommand={(v) => useWorkbench.getState().setTerminalInput(v)}
            history={terminalHistory}
            running={running}
            onRun={() => useWorkbench.getState().runTerminal()}
            onClear={() => useWorkbench.getState().clearTerminal()}
          />
        ) : null}
        {tab === "research" ? (
          <ResearchSurface
            query={researchQuery}
            onQuery={(v) => useWorkbench.getState().setResearchQuery(v)}
            hits={researchHits}
            error={researchError}
            busy={researchBusy}
            onSearch={() => void useWorkbench.getState().research()}
          />
        ) : null}
      </main>
      <div className="shrink-0 md:hidden">
        <TabBar
          tab={tab}
          onTab={(next) => useWorkbench.getState().setTab(next)}
          pendingCount={pending.length}
        />
      </div>
      <SettingsPanel
        open={settingsOpen}
        instructionSheet={instructionSheet}
        onSheet={(v) => useWorkbench.getState().setInstructionSheet(v)}
        aiAvailable={aiAvailable}
        onClose={() => useWorkbench.getState().setSettingsOpen(false)}
        onClearChat={() => useWorkbench.getState().clearChat()}
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple
        onClick={(event) => {
          event.currentTarget.setAttribute("webkitdirectory", "true");
        }}
        onChange={async (event) => {
          const list = event.target.files;
          if (!list?.length) return;
          const incoming: Record<string, string> = {};
          await Promise.all(
            [...list].map(async (file) => {
              if (file.size > 200_000) return;
              const relative = file.webkitRelativePath || file.name;
              const path = relative.replace(/^[^/]+\//, "");
              if (!path || path.includes("node_modules") || path.startsWith(".")) return;
              const text = await file.text();
              if (text.includes("\u0000")) return;
              incoming[path] = text;
            }),
          );
          if (Object.keys(incoming).length) {
            const folder = list[0]?.webkitRelativePath.split("/")[0];
            useWorkbench.getState().importFiles(incoming, folder);
          }
          event.target.value = "";
        }}
      />
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
