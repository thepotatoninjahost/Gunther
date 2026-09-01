# Gunther

Evidence-first coding agent. Chat, files, dual-approval review, terminal, and local research.

## Install on your phone (Galaxy / Android)

You do **not** need a computer.

1. On your phone, open **[this download page](https://github.com/thepotatoninjahost/Gunther/releases/latest)**.
2. Tap **Gunther.apk**.
3. Open the file and tap **Install**.
4. If the phone says it is blocked: **Settings → Apps →** (Chrome or Samsung Internet) **→ Install unknown apps → Allow**. Then tap the APK again.
5. Open **Gunther** from your app list.

That is the app.

## What it does

A single shared workspace drives every mutation. Proposed writes come back as **accepted** or **rejected**. Writes need **two owner confirmations**.

On the phone build, the agent runs locally: list, read, verify, terminal, handbook search, and starter patches (bugs in the ledger, overdraft protection) work without a server.

## Surfaces

| Tab | What it does |
|---|---|
| Chat | Talk to the agent. Tap a starter to send. |
| Files | Virtual workspace. Starter project is Pulse Ledger (intentionally buggy). |
| Review | Dual-approval for proposed writes. Checksums + rollback. |
| Terminal | `ls`, `cat`, `grep`, `pwd` against the workspace. |
| Research | Local chunked handbook. |

## Dual approval

1. Agent proposes a change set (preview + checksum).
2. Owner confirms once.
3. Owner confirms again.
4. The write is checksum-verified, then applied — or rolled back.
