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

**`frameAll` computes its own viewport instead of calling `fitView`.** The
canvas fills the window and every piece of chrome floats over it, so a fit that
centres in the whole window parks the top agent under the title bar and the
bottom one under the command bar. The insets live in `CHROME` in `store.ts`;
adjust them there if the chrome changes height. Two things bite here:
`getNodesBounds` reads `node.measured`, which xyflow keeps on its internal
nodes and never writes back to the ones `getNodes()` returns, so it reports a
zero-size box — `nodesBox` measures the rendered elements instead. And a
viewport animation is driven by `requestAnimationFrame`, which a hidden window
does not run, so the duration drops to zero when `document.hidden`.

**Floating chrome lives in the shell, not inside `<ReactFlow>`.** Toolbar and
CommandBar render in `App.tsx` next to TitleBar and Rail, wrapped in
`ReactFlowProvider` so `useReactFlow()` still resolves. This keeps app chrome
out of the pannable, zoomable canvas, which is where it belongs.

**Canvas nodes are square.** A deliberate look, not a workaround.

**Wires are floating edges.** `WireEdge` ignores the handle coordinates
xyflow hands it and computes where the centre-to-centre line crosses each
node's border. Anchoring to a fixed handle made two agents side by side get
joined by a loop arcing off the top of the screen, because nothing picks a
handle that faces the peer. The connector dots still exist for dragging new
connections; they just do not decide how a wire is drawn.

**SMIL `begin` is measured from the start of the SVG document timeline, not
from when the element mounts.** A `<animateMotion begin="0s">` added to a live
canvas is therefore already past its end time and snaps straight to its frozen
end state without ever moving. `WireEdge` keeps one bead per wire and starts it
with `beginElement()` from an effect. Remounting the element with a changed
React key does not help, and neither does a `key` on the animation itself.

**`prefers-reduced-motion` in `styles.css` only reaches CSS animations.** SMIL
has to opt out in JavaScript, which `WireEdge` does via `matchMedia`.

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

Launching is optimistic. `launchAgent` puts a stand-in node on the canvas
before it touches git or spawns anything, because creating a worktree and
starting a CLI takes a second or two and the click would otherwise do nothing
visible. The stand-in carries `data.pending`, has no Bus node behind it, and is
excluded from the saved workspace; anything that reaches the backend has to
check for it.

`list_harnesses` returns `{name, label, available, bus}`. `bus` is false for
CLIs with no drivable MCP support; they still run as terminals.

Events to the frontend: `agent-output {nodeId, chunk}`,
`agent-status {nodeId, status}`,
`bus-event {kind: "message"|"task"|"approval"|"edges"|"memory", ...}`.

MCP tools: `list_peers`, `get_peer_context`, `list_canvas`, `message_peer`,
`check_inbox`, `add_task`, `list_tasks`, `claim_task`, `complete_task`,
`remember`, `recall`, `forget`, `get_node_status`, `wait_for_nodes`, `ask_user`.
An agent only sees peers joined to it by an edge.

## Harness output

`classify_and_push` in `spawn.rs` turns one CLI line into a transcript line.
Claude Code speaks stream-json, so `tool_use` items become `> Read(path)` lines
and the `result` message carries `usage` and `total_cost_usd`, which the Bus
accumulates per node. Everything else is plain text.

Transcript lines are keyed by their absolute position in the stream, which is
why the store carries a `trimmed` count per node. Keying by array index looked
fine until the scrollback buffer filled: every trim renumbered the whole
buffer, React remounted all of it, and the arrival animation strobed the entire
transcript on every chunk.

Output events are held in a `Map` and written once per animation frame. Agent
CLIs emit in small bursts and several run at once, so a `set` per chunk had
each node re-rendering hundreds of lines dozens of times a second.

`bus::strip_ansi` runs on every line before it reaches the canvas. Agent CLIs
colour their output and redraw spinners with escape codes, and a carriage
return means "redraw this line", so only the last segment survives. Without
this the canvas fills with `[32m` noise.

## Gotchas

- The MCP bridge must surface Bus rejections as tool errors. `bus_http` returns
  the HTTP status with the body, and any 4xx becomes `isError`. Before that,
  an agent messaging a node it was not connected to was told it succeeded.
- Tools must be added in two places in `mcp.rs`: the `call_tool` dispatch and
  the `tools()` list. Missing the second means agents can never discover the
  tool. `tests/mcp_bridge.rs` asserts the list.
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
