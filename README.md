# ThatIsOk

AI agent cost + approval cockpit. Floating island on top of macOS, hooks into Claude Code / Codex / OpenCode for permission approvals, syncs usage from Anthropic / OpenAI / Codex admin APIs.

## Features

- **Approval bridge** — pipes `PermissionRequest` and `PreToolUse` from Claude/Codex hooks to a floating island; approve / always / deny without leaving the keyboard
- **Multi-agent support** — Claude Code, Codex, OpenCode (via plugin)
- **Full hook lifecycle** — SessionStart, Stop, PreToolUse, PostToolUse, UserPromptSubmit, PermissionRequest
- **Multi-account usage sync** — Anthropic, OpenAI admin, DeepSeek, Codex local JWT, Claude JSONL transcripts
- **Island UI** — top-center pill → expands to dashboard (balance, today, month, runway, accounts)
- **System notifications** — get notified when permission is needed, even when island is hidden
- **Keyboard shortcuts** — `Cmd+Shift+Space` toggle, `Cmd+Shift+A` approve, `Cmd+Shift+D` deny
- **Local HTTP API** — other apps can read usage data from `127.0.0.1:45874`
- **Local-first** — all data in `electron-store`, no server, no telemetry

## Architecture

```
ThatIsOk/
├── main/                Electron main process
│   ├── index.js         app boot, IPC, sync timer, global shortcuts
│   ├── watcher.js       hook event router
│   ├── intervention-manager.js   approval queue + notifications
│   ├── ipc-server.js    local TCP bridge (127.0.0.1:45873)
│   ├── local-api.js     HTTP API for usage data (127.0.0.1:45874)
│   ├── config-injector.js  writes Claude/Codex hook config
│   ├── providers/       anthropic / openai / local-codex adapters
│   ├── services/        sync / forecast / local-codex JWT / local-claude
│   └── storage/         electron-store wrapper
├── bridge/              standalone hook bridge CLI (Node)
├── renderer/            island UI (HTML + CSS + JS)
├── plugins/             OpenCode plugin
├── bin/cli.js           `ok` command launcher
├── bin/install-opencode-plugin.js  OpenCode plugin installer
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

## Supported Agents

| Agent | Hook Events | Approval Flow | Usage Tracking |
|-------|-------------|---------------|----------------|
| Claude Code | SessionStart, Stop, PreToolUse, PostToolUse, UserPromptSubmit, PermissionRequest | Yes | Local JSONL transcripts |
| Codex | SessionStart, Stop, PreToolUse, PostToolUse, UserPromptSubmit | Yes | auth.json JWT decode |
| DeepSeek | Via local API | Yes | auth.json JWT decode |
| OpenCode | Full lifecycle via plugin | Yes | Via plugin |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Shift+Space` | Toggle island visibility |
| `Cmd/Ctrl+Shift+A` | Approve current permission request |
| `Cmd/Ctrl+Shift+L` | Approve always (auto-approve same requests) |
| `Cmd/Ctrl+Shift+D` | Deny current permission request |

> Shortcuts work on both macOS and Windows (Electron's `CommandOrControl`)

## Local HTTP API

Usage data is available at `http://127.0.0.1:45874`:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/usage` | Full dashboard data |
| `GET /api/overview` | Balance, costs, runway |
| `GET /api/accounts` | Account list with balances |
| `GET /api/intervention` | Current pending permission request |

## OpenCode Plugin

OpenCode 是一个 AI 代码编辑器插件，ThatIsOk 提供插件形式的 Hook Bridge 支持。

安装后，OpenCode 的所有 hook 事件（SessionStart/Stop、PreToolUse、PermissionRequest 等）会通过插件发送到 ThatIsOk 的 IPC bridge，实现统一的权限审批和用量追踪。

Install the OpenCode plugin:

```bash
npm run plugin:install
```

Uninstall:

```bash
npm run plugin:uninstall
```

Check status:

```bash
npm run plugin:status
```

## License

ISC
