type FilesResult = {
  ok?: boolean;
  error?: string;
  exit?: number;
  output?: string;
  folder?: boolean;
  disk?: string;
  hits?: { title: string; excerpt: string; url: string }[];
  passed?: boolean;
  issues?: string[];
  checked?: number;
};

declare global {
  interface Window {
    GuntherFiles?: {
      pickFolder: () => void;
      pickFiles: () => void;
      writeFile: (path: string, content: string) => string;
      deleteFile: (path: string) => string;
      hasDisk: () => boolean;
      runShell: (requestId: string, command: string) => void;
      searchWeb: (requestId: string, query: string) => void;
      verify: (requestId: string) => void;
    };
    __guntherFilesDone?: (requestId: string, result: FilesResult) => void;
    __guntherFilesWait?: Record<string, (result: FilesResult) => void>;
  }
}

function files() {
  if (typeof window === "undefined") return undefined;
  return window.GuntherFiles;
}

export function hasDisk(): boolean {
  try {
    return Boolean(files()?.hasDisk());
  } catch {
    return false;
  }
}

export function persistFile(path: string, content: string | null): FilesResult {
  const bridge = files();
  if (!bridge) return { ok: false, error: "No phone disk" };
  try {
    const raw = content == null ? bridge.deleteFile(path) : bridge.writeFile(path, content);
    return JSON.parse(raw) as FilesResult;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "persist failed" };
  }
}

function call(method: "runShell" | "searchWeb" | "verify", arg = ""): Promise<FilesResult> {
  const bridge = files();
  if (!bridge) return Promise.resolve({ ok: false, error: "Import a folder on the phone first." });
  const requestId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      delete window.__guntherFilesWait?.[requestId];
      resolve({ ok: false, error: "Timed out" });
    }, 25000);
    window.__guntherFilesWait = window.__guntherFilesWait ?? {};
    window.__guntherFilesWait[requestId] = (result) => {
      window.clearTimeout(timer);
      delete window.__guntherFilesWait?.[requestId];
      resolve(result);
    };
    window.__guntherFilesDone = (id, result) => {
      window.__guntherFilesWait?.[id]?.(result);
    };
    if (method === "runShell") bridge.runShell(requestId, arg);
    else if (method === "searchWeb") bridge.searchWeb(requestId, arg);
    else bridge.verify(requestId);
  });
}

export function runShell(command: string) {
  return call("runShell", command);
}

export function searchWeb(query: string) {
  return call("searchWeb", query);
}

export function verifyDisk() {
  return call("verify");
}
