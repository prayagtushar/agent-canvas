# AGENTS.md — Agent Canvas project memory

Read this first. It is the single source of truth for continuing this project.

## What this is

"Agent Canvas" — a Tauri 2 desktop app where multiple AI coding agents
(Claude Code, Gemini CLI, opencode, Codex) run as real headless processes on a
spatial canvas, discover peers through explicit connections, share a task
board, message each other, and escalate decisions to the human operator.
Full architecture lives in `PLAN.md`. Read it too.

## Current status (as of 2026-08-22, post translucency + replica pass)

Done (compiles, typechecks, tests pass):
- Research + full architecture: `PLAN.md`
- Rust: `src-tauri/src/{main,lib,bus,server,mcp,spawn}.rs` — `cargo check` clean,
  Bus binds 127.0.0.1:<random> and enforces bearer auth on **every** route
  (including `/health`).
- Frontend: React app under `src/` (zustand store, xyflow canvas with
  agent/taskboard/note nodes, rail, toolbar, command bar, approvals, toasts).
  `npm run build` clean.
- `src-tauri/tests/bus_flow.rs` — 5 integration tests covering the M7 flow
  (peer scoping, edge-gated messaging, task lifecycle, ask_user, disconnect).
  Run with `cargo test --test bus_flow`.

### Translucent window (the defining visual)
The window is transparent and macOS vibrancy blurs the user's real desktop
wallpaper behind the whole surface. Three things must all hold or it breaks:
1. `tauri.conf.json`: `transparent: true`, `windowEffects.effects:
   ["underWindowBackground"]`, **no `backgroundColor`** (setting one forces an
   opaque window).
2. `Cargo.toml`: `tauri` needs the `macos-private-api` feature, which backs
   `app.macOSPrivateApi: true` in the config.
3. CSS: `html`, `body`, `#root`, `.shell`, `.canvas-wrap`, and every
   `.react-flow*` layer must stay `background: transparent`. The only paint
   between wallpaper and work is `.canvas-wrap::before`, whose alpha comes from
   the `--tint` variable.

`--tint` is user-controlled by the slider in the bottom toolbar, persisted to
`localStorage` under `ac.tint` and saved into the workspace file.

**Floating chrome must live in the shell, never inside `<ReactFlow>`.**
Toolbar and CommandBar were ReactFlow `<Panel>`s and rendered as a skewed white
slab and a clipped bar in the real window (invisible in a normal browser). Any
layer composited inside the canvas subtree is at risk in a transparent
WKWebView. They now render in `App.tsx` beside TitleBar/Rail, wrapped in
`ReactFlowProvider` so `useReactFlow()` still works.

**Never use `backdrop-filter` (or `filter`) in `styles.css`.** Two reasons:
it does not blur the desktop at all — it only samples within the page, and
all wallpaper blur comes from the native vibrancy layer — and in a
transparent window WKWebView renders it as huge elliptical clip artifacts
that slice across the canvas and cut through agent windows, the toolbar and
the command bar. This shipped broken once and was only caught from a
screenshot of the real app; a plain translucent fill over the vibrancy layer
already reads as frosted glass. Use `opacity` to dim.

### UI shape
Full-bleed canvas; chrome floats as glass slabs, content (terminals) is solid.
Titlebar (logo, workspace, agent count, Save, Bus, ···, Focus, zoom), left icon
rail, terminal-window agent nodes with 8 green connector dots and a two-line
footer, yellow sticky notes, Project card, floating approval cards, bottom
toolbar pill, white command bar with a natural-language parser.
Every titlebar/toolbar control performs a real action — there is no inert chrome.

### Since the open-source pass
- Fonts are bundled and OFL: Geist Sans (chrome) + JetBrains Mono (terminals),
  via `@fontsource*`. No network fetch at runtime.
- **The working folder is chosen by the operator** (toolbar folder button, uses
  `tauri-plugin-dialog`), defaulting to the home directory on first run. There
  is no hardcoded path anywhere — do not reintroduce one.
- Shared memory: `bus.rs` `remember`/`recall`/`forget`, `/memory` routes, MCP
  tools, and a Memory node on the canvas.
- Git worktree isolation: toggle in the toolbar settings menu. Worktrees go to
  `<repo>/.agent-canvas/worktrees/<slug>` on branch `agent/<slug>`.
- 12 harnesses in the `HARNESSES` table in `spawn.rs`, keyed by a `BusWiring`
  variant. Only claude + opencode are runtime-tested; README says so honestly.
- Four themes (midnight/slate/ink/aurora) that re-tint the scrim only.
- Shortcuts overlay (`?`), ⌘K/⌘S/⌘F/⌘./⌘\.
- Open-source scaffolding: README, CONTRIBUTING, LICENSE (MIT), .gitignore.

NOT done:
1. Nobody has visually confirmed the vibrancy on screen. Screen-recording
   permission was unavailable in the build session, so the transparency is
   verified by config + computed-style audit only. Run `npm run tauri dev`
   and look.
2. gemini/codex adapter runtime testing (only claude + opencode CLIs installed).

Gotchas discovered during build:
- axum 0.8: routes use `/{param}`; `Option<Query<T>>` does NOT satisfy Handler —
  use `Query<HashMap<String,String>>` (empty query deserializes fine).
- `generate_context!` panics without `src-tauri/icons/icon.png`. Regenerate the
  whole set with `npm run tauri icon assets/logo.png`; `assets/logo.png` is the
  1024px master and `assets/logo.svg` is the source drawing.
- server state is `(Arc<BusShared>, token)` tuple; mcp.rs proxies tools to the
  Bus with hand-rolled HTTP over TcpStream (no reqwest).
- spawn.rs registries: CHILDREN/Arc<Mutex<Child>>, SESSIONS (claude --resume),
  INTERRUPTED set; waiter threads poll try_wait every 200ms.
- `claim_task` used to let any agent steal an already-owned task; it now rejects
  a claim from anyone but the current owner. Caught by `bus_flow.rs`.
- Autosave subscribes to the zustand store but must compare `nodes`/`edges` by
  reference — subscribing to every change means streaming output resets the
  debounce forever and the workspace never saves.
- The canvas is bottom-left toolbar + bottom-right minimap; the toolbar sheds
  segments under 1180/1040px so the two never collide at the 960px min width.
- `window.canvas` exposes the zustand store in dev builds only, for driving the
  canvas from the console (Tauri commands are unavailable in a plain browser).

## Locked API contract (keep these names consistent)

Tauri commands (invoke from frontend):
`add_agent {label,harness,cwd,prompt}`, `send_prompt {id,text}`,
`interrupt_agent {id}`, `kill_agent {id}`, `list_harnesses`,
`save_workspace {json}`, `load_workspace`, `answer_approval {id,answer}`,
`get_bus_info`, `add_edge {a,b}`, `remove_edge {a,b}`,
`default_workspace_root`, `is_git_repo {path}`, `create_worktree {repo,name}`,
`remove_worktree {repo,path}`, `list_memory`, `remember {key,value}`,
`forget_memory {key}`.

`list_harnesses` returns `{name, label, available, bus}` per harness — `bus`
is false for CLIs with no drivable MCP support (they still run as terminals).

Rust → frontend events (listen with @tauri-apps/api/event):
`agent-output {nodeId, chunk}`, `agent-status {nodeId,status}`,
`bus-event {kind:"message"|"task"|"approval"|"edges"|"memory", ...}`.

MCP tool names exposed to agents: `list_peers`, `get_peer_context`,
`message_peer`, `check_inbox`, `list_canvas`, `add_task`, `list_tasks`,
`claim_task`, `complete_task`, `get_node_status`, `wait_for_nodes`, `ask_user`,
`remember`, `recall`, `forget`.
Peer scoping: only agents connected by an edge to the caller are visible.

## Gotchas learned during research

- Claude Code stream-json lines: type "system" subtype "init" carries
  `session_id` (save it; reuse with `--resume <session_id>` for follow-up turns),
  type "assistant" has `message.content[].text`, type "result" ends the turn.
- Follow-up prompts: MVP spawns a fresh `claude -p` per turn with `--resume`.
  gemini/opencode/codex get fresh runs per turn (no resume).
- axum 0.x route syntax: `/{param}` (changed from `/:param` in 0.5+... verify
  against 0.8 docs when compiling).
- Tauri v2 needs `capabilities/default.json` (already present, core:default).
- `bundle.icon` is empty in tauri.conf.json; `tauri build` will fail until icons
  are generated: run `npm run tauri icon path/to/icon.png` or set `"targets": null`
  while developing. `tauri dev` works without icons.
- The same binary runs in two modes (GUI / `--bus-mcp`); dispatch happens at the
  very top of `main.rs` before any GUI code.
- First `cargo check` downloads/compiles the whole Tauri stack; expect minutes.
- User's machine: Apple Silicon macOS, Node 25, cargo 1.98, CLTs installed.
  Installed agent CLIs: claude 2.1.233, gemini, opencode. codex NOT installed
  (adapter still gets implemented; availability check marks it disabled).

## Definition of done for MVP demo

Launch app → sidebar → launch "claude" agent node with prompt → node streams
output live → launch second agent (gemini or opencode), draw edge between them
→ ask agent A (via its prompt box) to `list_peers` → it sees only B → A sends
B a task via `add_task` → B claims/completes → both visible on taskboard node
→ A calls `ask_user` → approval card appears in UI → answering unblocks A.
