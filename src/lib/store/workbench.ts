import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentEvent,
  AgentStatus,
  ChangeSet,
  ChatMessage,
  FileMap,
  PendingChangeProposal,
  ResearchHit,
  SurfaceTab,
  TerminalEntry,
} from "@/lib/agent/types";
import { DEFAULT_INSTRUCTION_SHEET } from "@/lib/agent/prompt";
import { runAgentLoop } from "@/lib/agent/loop";
import { probeAi, researchTopic } from "@/lib/agent/llm";
import { uid } from "@/lib/utils";
import { getEngine, resetEngine } from "@/lib/workspace/engine";
import { cloneStarter, STARTER_NAME } from "@/lib/workspace/starter";
import { runCommand } from "@/lib/workspace/terminal";
import { searchKnowledge } from "@/lib/knowledge/search";

type WorkbenchState = {
  projectName: string;
  files: FileMap;
  chat: ChatMessage[];
  events: AgentEvent[];
  terminalHistory: TerminalEntry[];
  pending: PendingChangeProposal[];
  transactions: ChangeSet[];
  instructionSheet: string;
  tab: SurfaceTab;
  status: AgentStatus;
  detail: string;
  running: boolean;
  cancelled: boolean;
  runToken: string;
  aiAvailable: boolean | null;
  chatInput: string;
  editorPath: string;
  editorDraft: string;
  fileFilter: string;
  terminalInput: string;
  researchQuery: string;
  researchHits: ResearchHit[];
  researchError: string | null;
  researchBusy: boolean;
  settingsOpen: boolean;
  hydrateEngine: () => void;
  setTab: (tab: SurfaceTab) => void;
  setChatInput: (value: string) => void;
  setFileFilter: (value: string) => void;
  setEditorPath: (path: string) => void;
  setEditorDraft: (value: string) => void;
  setTerminalInput: (value: string) => void;
  setResearchQuery: (value: string) => void;
  setInstructionSheet: (value: string) => void;
  setSettingsOpen: (open: boolean) => void;
  newProject: () => void;
  loadSample: () => void;
  importFiles: (incoming: FileMap, name?: string) => void;
  createFile: (path: string) => void;
  probe: () => Promise<void>;
  send: (preset?: string) => Promise<void>;
  stop: () => void;
  approve: () => Promise<void>;
  reject: () => void;
  rollbackLast: () => Promise<void>;
  proposeEditorSave: () => Promise<void>;
  runTerminal: () => void;
  clearTerminal: () => void;
  research: () => Promise<void>;
  clearChat: () => void;
};

function snapshotFiles(): FileMap {
  return getEngine().workspace.snapshot();
}

function snapshotPending(): PendingChangeProposal[] {
  return getEngine().mutations.list();
}

export const useWorkbench = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      projectName: "workspace",
      files: {},
      chat: [],
      events: [],
      terminalHistory: [],
      pending: [],
      transactions: [],
      instructionSheet: DEFAULT_INSTRUCTION_SHEET,
      tab: "chat",
      status: "ready",
      detail: "Talk freely — import files or ask Grok to build something",
      running: false,
      cancelled: false,
      runToken: "",
      aiAvailable: null,
      chatInput: "",
      editorPath: "",
      editorDraft: "",
      fileFilter: "",
      terminalInput: "",
      researchQuery: "",
      researchHits: [],
      researchError: null,
      researchBusy: false,
      settingsOpen: false,

      hydrateEngine: () => {
        resetEngine(get().files, get().pending);
        set({
          files: snapshotFiles(),
          pending: snapshotPending(),
          running: false,
          cancelled: false,
          settingsOpen: false,
        });
      },

      setTab: (tab) => set({ tab }),
      setChatInput: (chatInput) => set({ chatInput }),
      setFileFilter: (fileFilter) => set({ fileFilter }),
      setEditorPath: (editorPath) => {
        try {
          const content = getEngine().workspace.read(editorPath);
          set({ editorPath, editorDraft: content, tab: "files" });
        } catch {
          set({ editorPath, editorDraft: "", tab: "files" });
        }
      },
      setEditorDraft: (editorDraft) => set({ editorDraft }),
      setTerminalInput: (terminalInput) => set({ terminalInput }),
      setResearchQuery: (researchQuery) => set({ researchQuery }),
      setInstructionSheet: (instructionSheet) => set({ instructionSheet }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

      newProject: () => {
        resetEngine({});
        set({
          projectName: "workspace",
          files: {},
          pending: [],
          transactions: [],
          editorPath: "",
          editorDraft: "",
          chat: [],
          events: [],
          status: "ready",
          detail: "Blank project — type what you want built",
        });
      },

      loadSample: () => {
        resetEngine(cloneStarter());
        set({
          projectName: STARTER_NAME,
          files: snapshotFiles(),
          pending: [],
          transactions: [],
          editorPath: "",
          editorDraft: "",
          chat: [],
          events: [],
          status: "ready",
          detail: "Sample mounted — Pulse Ledger. Optional demo only.",
        });
      },

      importFiles: (incoming, name) => {
        const merged = { ...getEngine().workspace.snapshot(), ...incoming };
        resetEngine(merged);
        set({
          projectName: name?.trim() || get().projectName || "workspace",
          files: snapshotFiles(),
          pending: [],
          transactions: [],
          editorPath: "",
          editorDraft: "",
          status: "ready",
          detail: `Added ${Object.keys(incoming).length} file(s)`,
        });
      },

      createFile: (path) => {
        const key = path.trim().replace(/^\/+/, "");
        if (!key) return;
        if (getEngine().workspace.exists(key)) {
          set({ detail: `${key} already exists`, tab: "files" });
          get().setEditorPath(key);
          return;
        }
        getEngine().workspace.writeOwner(key, "");
        set({
          files: snapshotFiles(),
          editorPath: key,
          editorDraft: "",
          tab: "files",
          status: "ready",
          detail: `Created ${key}`,
        });
      },

      probe: async () => {
        try {
          const result = await probeAi();
          set({ aiAvailable: result.available });
        } catch {
          set({ aiAvailable: false });
        }
      },

      send: async (preset) => {
        const request = (preset ?? get().chatInput).trim();
        if (!request || get().running) return;
        const userMsg: ChatMessage = {
          id: uid("msg"),
          role: "user",
          content: request,
          createdAt: Date.now(),
        };
        const runToken = uid("run");
        set({
          chatInput: "",
          running: true,
          cancelled: false,
          runToken,
          status: "planning",
          detail: "Inspecting the request",
          chat: [...get().chat, userMsg],
        });
        const watchdog =
          typeof window === "undefined"
            ? null
            : window.setTimeout(() => {
                if (get().runToken !== runToken || !get().running) return;
                set({
                  running: false,
                  status: "failed",
                  detail: "That took too long. Try again — there is no try limit.",
                });
              }, 180000);
        const engine = getEngine();
        try {
          const result = await runAgentLoop(request, {
            workspace: engine.workspace,
            mutations: engine.mutations,
            files: engine.workspace.snapshot(),
            history: get().chat,
            instructionSheet: get().instructionSheet,
            handlers: {
              onEvent: (phase, detail) => {
                if (get().runToken !== runToken) return;
                const event: AgentEvent = { id: uid("ev"), phase, detail, at: Date.now() };
                const status = mapPhase(phase);
                set({
                  events: [...get().events, event].slice(-80),
                  status,
                  detail,
                });
              },
              onProposal: () => {
                if (get().runToken !== runToken) return;
                set({ pending: snapshotPending(), tab: "review", status: "approval" });
              },
              isCancelled: () => get().cancelled || get().runToken !== runToken,
            },
          });
          if (get().runToken !== runToken) return;
          const agentMsg: ChatMessage = {
            id: uid("msg"),
            role: "agent",
            content: result.text,
            createdAt: Date.now(),
          };
          set({
            chat: [...get().chat, agentMsg],
            files: snapshotFiles(),
            pending: snapshotPending(),
            running: false,
            status: result.failed ? "failed" : result.proposalId ? "approval" : "ready",
            aiAvailable:
              result.failed && /credits|unavailable/i.test(result.text) ? false : get().aiAvailable,
            detail: result.proposalId
              ? "Proposal staged — confirm twice in Review"
              : result.failed
                ? "Run failed"
                : "Ready",
            tab: result.proposalId ? "review" : get().tab,
          });
        } catch (error) {
          if (get().runToken !== runToken) return;
          set({
            running: false,
            status: "failed",
            detail: error instanceof Error ? error.message : "Run failed",
          });
        } finally {
          if (watchdog != null) window.clearTimeout(watchdog);
          if (get().runToken === runToken) set({ running: false });
        }
      },

      stop: () => {
        if (!get().running) return;
        set({ cancelled: true, status: "stopped", detail: "Stopped by owner", running: false });
      },

      approve: async () => {
        const pending = getEngine().mutations.list()[0];
        if (!pending) return;
        const result = await getEngine().mutations.approve(pending.id, true, "owner");
        if (result.kind === "awaiting-second") {
          set({
            pending: snapshotPending(),
            status: "approval",
            detail: "First confirmation recorded — confirm again",
          });
          return;
        }
        if (result.kind === "rejected") {
          set({
            pending: snapshotPending(),
            status: "failed",
            detail: result.reason,
          });
          return;
        }
        set({
          files: snapshotFiles(),
          pending: snapshotPending(),
          transactions: [...get().transactions, result.changeSet].slice(-20),
          status: "ready",
          detail: `Applied ${result.changeSet.changes.length} file(s)`,
          editorDraft:
            get().editorPath && getEngine().workspace.exists(get().editorPath)
              ? getEngine().workspace.read(get().editorPath)
              : get().editorDraft,
        });
      },

      reject: () => {
        const pending = getEngine().mutations.list()[0];
        if (!pending) return;
        getEngine().mutations.reject(pending.id);
        set({
          pending: snapshotPending(),
          status: "ready",
          detail: "Proposal rejected",
        });
      },

      rollbackLast: async () => {
        const last = get().transactions.at(-1);
        if (!last) return;
        const result = await getEngine().workspace.rollback(last);
        if (result.kind === "rejected") {
          set({ status: "failed", detail: result.reason });
          return;
        }
        set({
          files: snapshotFiles(),
          transactions: get().transactions.slice(0, -1),
          status: "ready",
          detail: "Last transaction rolled back",
          editorDraft:
            get().editorPath && getEngine().workspace.exists(get().editorPath)
              ? getEngine().workspace.read(get().editorPath)
              : get().editorDraft,
        });
      },

      proposeEditorSave: async () => {
        const path = get().editorPath;
        const draft = get().editorDraft;
        if (!path) return;
        getEngine().workspace.writeOwner(path, draft);
        set({
          files: snapshotFiles(),
          status: "ready",
          detail: `Saved ${path}`,
        });
      },

      runTerminal: () => {
        const command = get().terminalInput.trim();
        if (!command) return;
        const result = runCommand(getEngine().workspace.snapshot(), "", command);
        set({
          terminalHistory: [...get().terminalHistory, result].slice(-40),
          terminalInput: "",
        });
      },

      clearTerminal: () => set({ terminalHistory: [] }),

      research: async () => {
        const query = get().researchQuery.trim();
        if (!query || get().researchBusy) return;
        set({ researchBusy: true, researchError: null, status: "researching", detail: "Searching" });
        const local = searchKnowledge(query).map((hit) => ({
          title: `${hit.document} / ${hit.section}`,
          excerpt: hit.excerpt,
          url: `knowledge://${hit.document}/${hit.section}`,
        }));
        try {
          const remote = await researchTopic({ data: { query } });
          const remoteHits = remote.ok ? remote.hits : [];
          const error = remote.ok ? null : remote.error;
          const hits = [...local, ...remoteHits];
          set({
            researchHits: hits,
            researchError: hits.length ? null : error || "Research returned no evidence (fail closed).",
            researchBusy: false,
            status: hits.length ? "ready" : "failed",
            detail: hits.length ? `${hits.length} source(s)` : error || "No evidence",
          });
        } catch (error) {
          set({
            researchHits: local,
            researchError: error instanceof Error ? error.message : "Research failed",
            researchBusy: false,
            status: local.length ? "ready" : "failed",
            detail: local.length ? `${local.length} local source(s)` : "Research failed",
          });
        }
      },

      clearChat: () => set({ chat: [], events: [] }),
    }),
    {
      name: "coding-agent-workbench-v2",
      skipHydration: true,
      partialize: (state) => ({
        projectName: state.projectName,
        files: state.files,
        chat: state.chat.slice(-40),
        events: state.events.slice(-40),
        terminalHistory: state.terminalHistory.slice(-20),
        pending: state.pending,
        transactions: state.transactions.slice(-20),
        instructionSheet: state.instructionSheet,
        editorPath: state.editorPath,
      }),
      onRehydrateStorage: () => (state) => {
        state?.hydrateEngine();
      },
    },
  ),
);

function mapPhase(phase: string): AgentStatus {
  switch (phase.toUpperCase()) {
    case "STARTED":
    case "INTAKE":
    case "PLAN":
    case "PLANNING":
      return "planning";
    case "RESEARCH":
      return "researching";
    case "MODEL":
      return "model";
    case "TOOL":
      return "tool";
    case "APPROVAL":
      return "approval";
    case "DONE":
    case "COMPLETED":
      return "ready";
    case "FAILED":
      return "failed";
    default:
      return "working";
  }
}
