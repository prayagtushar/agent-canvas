# Engineering notes

Things about this codebase that are not obvious from reading it. Read this
before changing rendering, the Bus, or the harness adapters.

## Layout

| Path | What lives there |
| --- | --- |
| `src-tauri/src/bus.rs` | Coordination state: nodes, edges, tasks, memory, approvals |
| `src-tauri/src/server.rs` | Bus HTTP API (axum), bearer auth on every route |
| `src-tauri/src/mcp.rs` | MCP-over-stdio bridge, forwards tool calls to the Bus |
| `src-tauri/src/spawn.rs` | Harness table and process spawning |
| `src-tauri/src/lib.rs` | Tauri commands and app wiring |
| `src/store.ts` | Single source of frontend state |

## Rendering rules

**Do not use generic class names in `styles.css`.** xyflow puts its colour-mode
class on the ReactFlow container, so the element carries
`class="react-flow light"`. A bare `.light { border-radius: 50% }` rule written
for sticky-note traffic lights therefore matched the whole 1440x900 canvas
container, and with xyflow's inline `overflow: hidden` it clipped every node on
the canvas to a giant ellipse. The traffic lights are now `.tl-dot`. Before
adding a short class name, check it against the classes xyflow puts on its own
elements: `light`, `dark`, and everything prefixed `react-flow__`.

That bug cost three wrong diagnoses. `backdrop-filter`, `overflow: hidden` and
the drop shadow all got blamed and none of them were it. If you hit something
similar, dump `getComputedStyle` from the real window and walk
`document.styleSheets` for rules that `element.matches()`, rather than reasoning
about which property looks suspicious.

**`backdrop-filter` is pointless here.** It samples within the page, and the
page is transparent, so it cannot blur the desktop. All wallpaper blur comes
from the native vibrancy layer. A plain translucent fill over it already reads
as frosted glass. Use `opacity` to dim.

**Floating chrome lives in the shell, not inside `<ReactFlow>`.** Toolbar and
CommandBar render in `App.tsx` next to TitleBar and Rail, wrapped in
`ReactFlowProvider` so `useReactFlow()` still resolves. This keeps app chrome
out of the pannable, zoomable canvas, which is where it belongs.

**Canvas nodes are square.** A deliberate look, not a workaround.

A browser screenshot is weak evidence for UI work here. The app runs in a
transparent WKWebView. Check `npm run tauri dev`.

## Transparency

Three things must all hold or the wallpaper stops showing through:

1. `tauri.conf.json`: `transparent: true`, `windowEffects.effects:
   ["underWindowBackground"]`, and **no `backgroundColor`**, which forces an
   opaque window.
2. `Cargo.toml`: `tauri` needs the `macos-private-api` feature, which backs
   `app.macOSPrivateApi`.
3. `html`, `body`, `#root`, `.shell`, `.canvas-wrap` and every `.react-flow*`
   layer stay `background: transparent`. The only paint between wallpaper and
   work is `.canvas-wrap::before`, whose alpha is the `--tint` variable.

## API contract

Keep these names in sync across Rust and TypeScript.

Tauri commands: `add_agent {label,harness,cwd,prompt}`, `send_prompt {id,text}`,
`interrupt_agent {id}`, `kill_agent {id}`, `list_harnesses`,
`save_workspace {json}`, `load_workspace`, `answer_approval {id,answer}`,
`get_bus_info`, `add_edge {a,b}`, `remove_edge {a,b}`, `default_workspace_root`,
`is_git_repo {path}`, `create_worktree {repo,name}`, `remove_worktree
{repo,path}`, `list_memory`, `remember {key,value}`, `forget_memory {key}`.

`list_harnesses` returns `{name, label, available, bus}`. `bus` is false for
CLIs with no drivable MCP support; they still run as terminals.

Events to the frontend: `agent-output {nodeId, chunk}`,
`agent-status {nodeId, status}`,
`bus-event {kind: "message"|"task"|"approval"|"edges"|"memory", ...}`.

MCP tools: `list_peers`, `get_peer_context`, `list_canvas`, `message_peer`,
`check_inbox`, `add_task`, `list_tasks`, `claim_task`, `complete_task`,
`remember`, `recall`, `forget`, `get_node_status`, `wait_for_nodes`, `ask_user`.
An agent only sees peers joined to it by an edge.

## Gotchas

- The Bus owns the peer graph. The canvas asks it to connect and renders what
  it emits back, never the reverse.
- `claim_task` is exclusive. It used to let any agent take a task another agent
  already owned, so two agents both believed they owned it. `bus_flow.rs`
  covers this.
- Autosave compares `nodes` and `edges` by reference. Subscribing to every
  store change means streaming agent output resets the debounce forever and the
  workspace never saves.
- axum 0.8 routes use `/{param}`, and `Option<Query<T>>` does not satisfy
  Handler. Use `Query<HashMap<String, String>>`; an empty query deserializes
  fine.
- `mcp.rs` speaks HTTP to the Bus by hand over `TcpStream`. There is no reqwest
  dependency, so any new verb needs to work with that.
- `spawn.rs` keeps three registries: `CHILDREN`, `SESSIONS` for
  `claude --resume`, and `INTERRUPTED`. Waiter threads poll `try_wait` every
  200ms.
- Claude Code stream-json: `type: "system"` with `subtype: "init"` carries the
  `session_id` to reuse with `--resume`, `type: "assistant"` holds
  `message.content[].text`, `type: "result"` ends the turn. Every other harness
  gets a fresh run per turn.
- The same binary runs as the GUI and as the MCP bridge. `main.rs` dispatches on
  `--bus-mcp` before any GUI code.
- `generate_context!` panics without `src-tauri/icons/icon.png`. Regenerate the
  set with `npm run tauri icon assets/logo.png`.
- The working folder is chosen by the operator and defaults to their home
  directory. Never hardcode a path.
- `window.canvas` exposes the store in dev builds only, for driving the canvas
  from a console where Tauri commands are unavailable.
- First `cargo check` builds the whole Tauri stack. Expect minutes.

## Verify

```sh
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```
