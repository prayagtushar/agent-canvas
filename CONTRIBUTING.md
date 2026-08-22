# Contributing

Thanks for looking. This is a small, opinionated codebase, so a few notes will
save you time.

## Layout

| Path | What lives there |
| --- | --- |
| `src-tauri/src/bus.rs` | Coordination state: nodes, edges, tasks, memory, approvals |
| `src-tauri/src/server.rs` | The Bus HTTP API (axum), bearer-auth on every route |
| `src-tauri/src/mcp.rs` | MCP-over-stdio bridge; proxies tool calls to the Bus |
| `src-tauri/src/spawn.rs` | Harness table and process spawning |
| `src-tauri/src/lib.rs` | Tauri commands and app wiring |
| `src/` | React frontend; `store.ts` is the single source of UI state |

## Getting set up

```sh
npm install
npm run tauri dev
```

## Before you open a PR

```sh
npm run build                      # typecheck + bundle
cd src-tauri && cargo check && cargo test
```

## Adding a harness

Two edits in `src-tauri/src/spawn.rs`:

1. A row in `HARNESSES` with the CLI name, display label, and how it learns
   about the Bus (`BusWiring`).
2. A match arm in `start_process` building its headless invocation.

If the CLI has no MCP support you can drive headlessly, use `BusWiring::None`.
It still runs on the canvas, and the launcher marks it "no bus". Only mark a
harness as run in the README table if you have actually run it.

## House rules

- **App chrome does not go inside `<ReactFlow>`.** Toolbar, command bar and
  any other floating UI render in the shell (`App.tsx`) next to the titlebar
  and rail. Layers composited inside the canvas subtree get mis-transformed in
  a transparent WKWebView. The command bar renders as a skewed slab and the
  toolbar gets clipped. Use `useReactFlow()` from inside `ReactFlowProvider`
  when chrome needs canvas state.
- **Never add `backdrop-filter` or `filter` to `src/styles.css`.** Same window,
  same class of bug: WebKit turns them into large elliptical clip artifacts.
  The blur already comes from the native vibrancy layer. Use `opacity` to dim.
- The Bus owns the peer graph. The canvas asks it to connect and then renders
  whatever the Bus emits back, never the reverse.
- Keep the locked API contract in `AGENTS.md` in sync if you rename a command,
  event, or MCP tool.
- No inert chrome. If a control is visible, it should do something.

## Reporting bugs

Include your OS, the harness CLIs installed (`claude --version` etc.), and
whatever the agent window printed.
