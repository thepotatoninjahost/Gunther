# Gunther

Evidence-first coding agent. Chat, files, dual-approval review, terminal, and local research — in the browser.

## What this is

A single shared workspace drives every mutation. Proposed writes come back as **accepted** or **rejected** (never a crash). Writes need **two owner confirmations**. The xAI key lives only on the server — never in the browser.

Offline-first: list, read, verify, terminal, local handbook search, and starter patches work without a model. When the gateway has credits, the agent loop uses typed tool calls.

## Run it

```bash
git clone https://github.com/thepotatoninjahost/Gunther.git
cd Gunther
cp .env.example .env
# put XAI_API_KEY in .env (optional — local lanes work without it)
npm install
npm run dev
```

## Download the build

Every green run on [Actions](https://github.com/thepotatoninjahost/Gunther/actions) uploads a **gunther-web** artifact (the production `.output` folder).

1. Open the latest **Build** run.
2. Scroll to **Artifacts**.
3. Download **gunther-web**.

Run it with Node:

```bash
unzip gunther-web.zip
cd gunther-web          # or whatever folder the zip unpacked
XAI_API_KEY=… node server/index.mjs
```

## Surfaces

| Tab | What it does |
|---|---|
| Chat | Talk to the agent. Direct lanes answer inventory, bug hunt, and overdraft patches without a model. |
| Files | Virtual workspace. Starter project is Pulse Ledger (intentionally buggy). |
| Review | Dual-approval for proposed writes. Checksums + rollback. |
| Terminal | `ls`, `cat`, `grep`, `pwd` against the workspace. |
| Research | Local chunked handbook first. Remote research only if the gateway has credits. |

## Dual approval

1. Agent proposes a change set (preview + checksum).
2. Owner confirms once.
3. Owner confirms again.
4. The write is checksum-verified, then applied — or rolled back.

There is no fabricated approval count. A write that has not been confirmed twice does not land.

## Layout

```
src/
  components/workbench/   Chat, files, review, terminal, research
  lib/agent/              Loop, lanes, tools, constitution
  lib/workspace/          Single ProjectWorkspace + MutationCoordinator
  lib/knowledge/          Chunked handbook + stem search
  lib/store/              Workbench store
  routes/                 App routes
```
