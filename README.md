# Gunther

Model-agnostic coding-agent runtime.

- **Android** (this directory) — Kotlin shell. Chat, tools, workspace, on-device or cloud backends.
- **[Web workbench](web/)** — browser runtime with a single shared workspace, sealed mutation results, dual-approval writes, and a chunked local handbook.

## Android

Open the project in Android Studio and run the `app` module.

## Web

```bash
cd web
cp .env.example .env   # optional XAI_API_KEY
npm install
npm run dev
```

See [web/README.md](web/README.md) for architecture and the audit-fix map.
