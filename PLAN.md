# Agent Canvas

A desktop workspace where multiple AI coding agents run as real processes on a
spatial canvas, discover each other through explicit connections, share a task
board, message one another, and escalate decisions to you.

## Product surfaces

1. **Canvas** (React Flow). Node types:
   - `agent` — a live agent process (Claude Code / Gemini CLI / opencode / Codex).
     Shows harness label, status ring (idle / running / waiting / exited),
     streaming output tail, unread-message badge.
   - `taskboard` — shared board. Tasks have title, details, status
     (todo / claimed / done), owner, result.
   - `note` — sticky note for instructions and context.
2. **Connections.** Edges drawn between nodes define who may talk to whom.
   `list_peers` only reports agents connected to the calling node.
3. **Bus** ("the Bus"). Coordination core. Runs as an HTTP API inside the app
   on 127.0.0.1 (random port, bearer token). Exposed to real agent processes
   as an MCP server so the tools appear natively in Claude Code / Gemini /
   opencode / Codex sessions:
   - peer discovery: `list_peers`, `get_peer_context`, `list_canvas`
   - messaging: `message_peer` (queued), `check_inbox`
   - tasks: `add_task`, `list_tasks`, `claim_task`, `complete_task`
   - dependencies: `get_node_status`, `wait_for_nodes`
   - human escalation: `ask_user` (surfaces an approval card in the UI)
4. **Operator UI.** Sidebar to launch agents (harness, name, working dir,
   opening prompt), inspector panel with full output stream, approval inbox
   for `ask_user` cards.

## Architecture

```
┌──────────────────────────── Tauri 2 app ────────────────────────────┐
│  React frontend                │  Rust backend                      │
│  ├─ Canvas (xyflow)            │  ├─ axum HTTP server (the Bus)     │
│  ├─ zustand store              │  ├─ process spawner per harness    │
│  ├─ approval inbox             │  ├─ MCP-over-stdio endpoint        │
│  └─ inspector                  │  └─ workspace persistence          │
└─────────────────────────────────────────────────────────────────────┘
                                   ▲
                    same binary invoked as: --bus-mcp PORT TOKEN NODE_ID
                                   │
     claude -p ... --mcp-config generated.json   ← injected by spawner
     gemini -p ... (GEMINI_CLI_SYSTEM_SETTINGS_PATH → generated settings)
     opencode run ... (XDG_CONFIG_HOME → generated config)
     codex exec ... (CODEX_HOME → generated config.toml)
```

Key trick: every spawned agent gets an MCP config that points back at this
app's own executable running in `--bus-mcp` mode. That subprocess speaks
newline-delimited JSON-RPC over stdio with the agent and proxies tool calls
to the in-app Bus over HTTP. The agents therefore use *real* bus tools with
no wrapper hacks.

## Harness adapters

| Harness | Headless invocation | Bus injection |
| --- | --- | --- |
| claude | `claude -p <prompt> --output-format stream-json --verbose --mcp-config <cfg> --permission-mode acceptEdits --allowedTools mcp__bus` | `.mcp.json` style config file; resume via `--resume <session_id>` |
| gemini | `gemini -p <prompt> --output-format json` | `GEMINI_CLI_SYSTEM_SETTINGS_PATH` → generated `settings.json` |
| opencode | `opencode run "<prompt>"` | `XDG_CONFIG_HOME` → generated `opencode/opencode.json` |
| codex | `codex exec <prompt>` | `CODEX_HOME` → generated `config.toml` |

Availability is checked on launch (`PATH` lookup); missing harnesses are shown
but disabled.

## Milestones

- [x] M0 research + architecture (this document)
- [x] M1 scaffold: Vite + React + TS + Tauri 2 compiles
- [x] M2 Bus: axum routes + scoped peers + task board + approvals
- [x] M3 MCP endpoint: initialize / tools list / tools call over stdio
- [x] M4 Spawner: four adapters, output streaming into canvas nodes
- [x] M5 Canvas UX: drag/connect nodes, status rings, inspector, approvals
- [x] M6 Persistence: workspace JSON save/load
- [x] M7 Verify: cargo check clean, vite build clean, Bus flow covered by
      `cargo test --test bus_flow` (peer scoping, messaging, tasks, ask_user)
- [x] M8 Translucent window over the desktop wallpaper, full operator UI

## Non-goals for MVP

Multiplayer across machines, embedded terminals/browsers/previews as node
types, git worktree automation, packaging/notarization, remote servers.

## Run

```sh
npm install
npm run tauri dev      # development
npm run tauri build    # production bundle
```

Requires: Node 18+, Rust stable, and at least one supported agent CLI on PATH.
