# Gunther Web Workbench

Evidence-first coding agent. Chat, files, dual-approval review, terminal, and local research — in the browser.

This is the web runtime of [Gunther](https://github.com/thepotatoninjahost/Gunther). The Android Kotlin shell stays at the repo root.

## What this is

A single shared `ProjectWorkspace` drives every mutation. `MutationCoordinator.propose` returns a sealed result (`Proposed` | `Rejected`) instead of throwing. Writes need two owner confirmations. The xAI key lives only in a server function — never in the client.

Offline-first: list, read, verify, terminal, local handbook search, and starter patches work without a model. When the gateway has credits, the agent loop uses typed tool calls.

## Run it

```bash
cd web
cp .env.example .env
# put XAI_API_KEY in .env (optional — local lanes work without it)
npm install
npm run dev
```

Open http://localhost:3000

## Surfaces

| Tab | What it does |
|---|---|
| Chat | Talk to the agent. Direct lanes answer inventory, bug hunt, and overdraft patches without a model. |
| Files | Virtual workspace. Starter project is Pulse Ledger (intentionally buggy). |
| Review | Dual-approval for proposed writes. Checksums + rollback. |
| Terminal | `ls`, `cat`, `grep`, `pwd` against the workspace. |
| Research | Local chunked handbook first. Remote research only if the gateway has credits. |

## Architecture (audit fixes)

| Priority | Fix |
|---|---|
| P0 | One `ProjectWorkspace`. `MutationCoordinator` is injected the same instance. |
| P0 | `ProposeResult` is sealed: `Proposed` or `Rejected(reason)`. No `require()`. |
| P2 | `XAI_API_KEY` is server-only (`src/lib/agent/llm.ts`). |
| P3 | Surfaces split: Chat / Files / Review / Terminal / Research. Zustand store as the view-model. |
| P3 | Tool args and model messages validated with Zod. |
| P4 | Live-module install does not pre-satisfy the constitution. |
| P4 | Handbook is pre-chunked and searched on demand. |

## Dual approval

1. Agent proposes a change set (preview + checksum).
2. Owner confirms once.
3. Owner confirms again.
4. `applyApproved` verifies checksums, writes, or rolls back.

There is no fabricated `approvalCount`. A write that has not been confirmed twice does not land.

## Layout

```
web/
  src/
    components/workbench/   Chat, files, review, terminal, research
    lib/agent/              Loop, lanes, tools, constitution
    lib/workspace/          Single ProjectWorkspace + MutationCoordinator
    lib/knowledge/          Chunked handbook + stem search
    lib/store/              Zustand workbench store
    routes/                 TanStack Start routes
```
