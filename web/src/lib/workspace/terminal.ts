import type { FileMap, TerminalEntry } from "@/lib/agent/types";
import { uid } from "@/lib/utils";
import { safePath } from "./checksum";

const MAX_OUTPUT = 16_384;

function entry(
  command: string,
  cwd: string,
  started: number,
  patch: Partial<TerminalEntry> & { stdout?: string; stderr?: string; exitCode?: number },
): TerminalEntry {
  return {
    id: uid("sh"),
    command,
    stdout: (patch.stdout ?? "").slice(0, MAX_OUTPUT),
    stderr: (patch.stderr ?? "").slice(0, MAX_OUTPUT),
    exitCode: patch.exitCode ?? 0,
    durationMs: Date.now() - started,
    timedOut: patch.timedOut ?? false,
    cancelled: patch.cancelled ?? false,
    cwd,
  };
}

function joinCwd(cwd: string, path: string): string {
  if (!path || path === ".") return cwd;
  if (path.startsWith("/")) return safePath(path);
  return safePath(cwd ? `${cwd}/${path}` : path);
}

export function runCommand(files: FileMap, cwd: string, raw: string): TerminalEntry {
  const started = Date.now();
  const command = raw.trim();
  if (!command) return entry(raw, cwd, started, { stderr: "empty command", exitCode: 1 });

  const [bin, ...rest] = tokenize(command);
  try {
    switch (bin) {
      case "help":
        return entry(command, cwd, started, {
          stdout:
            "Built-in shell over the project copy.\nCommands: ls pwd cat head tail wc grep find echo help date whoami sha256sum\nFile writes (rm, mkdir, redirects) are rejected — mutations need dual approval.",
        });
      case "pwd":
        return entry(command, cwd, started, { stdout: cwd ? `/${cwd}` : "/" });
      case "date":
        return entry(command, cwd, started, { stdout: new Date().toISOString() });
      case "whoami":
        return entry(command, cwd, started, { stdout: "owner" });
      case "echo":
        return entry(command, cwd, started, { stdout: rest.join(" ") });
      case "ls": {
        const target = rest[0] ? joinCwd(cwd, rest[0]) : cwd;
        const prefix = target ? `${target}/` : "";
        const names = new Set<string>();
        for (const path of Object.keys(files)) {
          if (target && path !== target && !path.startsWith(prefix) && path !== target) continue;
          if (path === target) {
            names.add(path.split("/").pop() ?? path);
            continue;
          }
          const restPath = target ? path.slice(prefix.length) : path;
          const name = restPath.split("/")[0];
          if (name) names.add(name);
        }
        const listed = [...names].sort();
        return entry(command, cwd, started, {
          stdout: listed.length ? listed.join("\n") : "(empty)",
        });
      }
      case "cat": {
        if (!rest[0]) return entry(command, cwd, started, { stderr: "cat: missing file", exitCode: 1 });
        const path = joinCwd(cwd, rest[0]);
        const content = files[path];
        if (content == null) {
          return entry(command, cwd, started, { stderr: `cat: ${path}: no such file`, exitCode: 1 });
        }
        return entry(command, cwd, started, { stdout: content });
      }
      case "head":
      case "tail": {
        const nFlag = rest[0] === "-n" ? Number(rest[1]) : 10;
        const fileArg = rest[0] === "-n" ? rest[2] : rest[0];
        if (!fileArg) return entry(command, cwd, started, { stderr: `${bin}: missing file`, exitCode: 1 });
        const path = joinCwd(cwd, fileArg);
        const content = files[path];
        if (content == null) {
          return entry(command, cwd, started, { stderr: `${bin}: ${path}: no such file`, exitCode: 1 });
        }
        const lines = content.split("\n");
        const slice = bin === "head" ? lines.slice(0, nFlag) : lines.slice(-nFlag);
        return entry(command, cwd, started, { stdout: slice.join("\n") });
      }
      case "wc": {
        if (!rest[0]) return entry(command, cwd, started, { stderr: "wc: missing file", exitCode: 1 });
        const path = joinCwd(cwd, rest[0]);
        const content = files[path];
        if (content == null) {
          return entry(command, cwd, started, { stderr: `wc: ${path}: no such file`, exitCode: 1 });
        }
        const lines = content.split("\n").length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        return entry(command, cwd, started, {
          stdout: `${lines} ${words} ${content.length} ${path}`,
        });
      }
      case "grep": {
        const needle = rest[0];
        const fileArg = rest[1];
        if (!needle || !fileArg) {
          return entry(command, cwd, started, { stderr: "usage: grep PATTERN FILE", exitCode: 1 });
        }
        const path = joinCwd(cwd, fileArg);
        const content = files[path];
        if (content == null) {
          return entry(command, cwd, started, { stderr: `grep: ${path}: no such file`, exitCode: 1 });
        }
        const hits = content
          .split("\n")
          .map((line, i) => (line.includes(needle) ? `${i + 1}:${line}` : null))
          .filter((v): v is string => Boolean(v));
        return entry(command, cwd, started, { stdout: hits.join("\n"), exitCode: hits.length ? 0 : 1 });
      }
      case "find": {
        const needle = rest[0] ?? "";
        const hits = Object.keys(files)
          .filter((p) => p.includes(needle))
          .sort();
        return entry(command, cwd, started, { stdout: hits.join("\n") || "(none)" });
      }
      case "sha256sum":
        return entry(command, cwd, started, {
          stderr: "sha256sum: use the Review panel checksums for mutations",
          exitCode: 1,
        });
      case "rm":
      case "mkdir":
      case "touch":
      case "mv":
      case "cp":
      case "chmod":
        return entry(command, cwd, started, {
          stderr: `${bin}: file mutations require dual owner approval — use Chat or Files → Propose save`,
          exitCode: 1,
        });
      default:
        if (command.includes(">") || command.includes("|")) {
          return entry(command, cwd, started, {
            stderr: "redirects and pipes are disabled; mutations go through dual approval",
            exitCode: 1,
          });
        }
        return entry(command, cwd, started, {
          stderr: `${bin}: command not found. Type help.`,
          exitCode: 127,
        });
    }
  } catch (error) {
    return entry(command, cwd, started, {
      stderr: error instanceof Error ? error.message : "command failed",
      exitCode: 1,
    });
  }
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command))) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
}
