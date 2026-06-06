# ThatIsOk

AI agent cost + approval cockpit. Floating island on top of macOS, hooks into Claude Code / Codex for permission approvals, syncs usage from Anthropic / OpenAI / Codex admin APIs.

## Features

- **Approval bridge** — pipes `PermissionRequest` from Claude/Codex hooks to a floating island; approve / always / deny without leaving the keyboard
- **Multi-account usage sync** — Anthropic cost report, OpenAI admin, local Codex `auth.json` JWT decode
- **Island UI** — top-center pill → expands to dashboard (balance, today, month, runway, accounts)
- **Local-first** — all data in `electron-store`, no server, no telemetry

## Architecture

```
ThatIsOk/
├── main/                Electron main process
│   ├── index.js         app boot, IPC, sync timer
│   ├── watcher.js       hook event router
│   ├── intervention-manager.js   approval queue
│   ├── ipc-server.js    local TCP bridge (127.0.0.1:45873)
│   ├── config-injector.js  writes Claude/Codex hook config
│   ├── providers/       anthropic / openai / local-codex adapters
│   ├── services/        sync / forecast / local-codex JWT
│   └── storage/         electron-store wrapper
├── bridge/              standalone hook bridge CLI (Node)
├── renderer/            island UI (HTML + CSS + JS)
├── bin/cli.js           `ok` command launcher
└── config/              providers / models / defaults (JSON)
```

## Run

```bash
npm install
npm start
```

The `ok` command launches the app:

```bash
./bin/cli.js
```

On first run, `ConfigInjector` writes hooks into `~/.claude/settings.json` and `~/.codex/hooks.json`. Remove those entries to uninstall the bridge.

## License

ISC
