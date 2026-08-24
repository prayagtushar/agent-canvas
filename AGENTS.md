# Engineering notes

Things about this codebase that are not obvious from reading it. Read this
before changing rendering, the Bus, or the harness adapters.

## Layout

| Path | What lives there |
| --- | --- |
| `src-tauri/src/bus.rs` | Coordination state: nodes, edges, tasks, memory, approvals |
| `src-tauri/src/server.rs` | Bus HTTP API (axum), bearer auth on every route |
| `src-tauri/src/mcp.rs` | MCP-over-stdio bridge, forwards tool calls to the Bus |
| `src-tauri/src/spawn.rs` | Harness table, Bus wiring, and how each CLI is invoked |
| `src-tauri/src/pty.rs` | One pty per agent: reader, status watcher, screen state |
| `src-tauri/src/worktree.rs` | Per-agent git worktrees |
| `src-tauri/src/lib.rs` | Tauri commands and app wiring |
| `src/store.ts` | Single source of frontend state |
| `src/terminals.ts` | Terminal emulators, keyed by node and owned outside React |
| `src/components/Activity.tsx` | The operator's copy of everything that crossed a wire |
| `src/teams.ts` | Built-in team templates, and the ones the operator saved |
| `src/report.ts` | The session report, as a pure function of store state |
| `src/notify.ts` | Desktop notifications for when the operator is away |
| `src-tauri/src/platform.rs` | The one place that cares which OS this is |
| `examples/` | Small projects with failing suites, to check the app end to end |

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

Tauri commands: `add_agent {label,harness,cwd,prompt,role}`,
`send_prompt {id,text}`, `interrupt_agent {id}`, `kill_agent {id}`,
`restart_agent {id}`, `rename_agent {id,label}`, `agent_input {id,data}`,
`agent_resize {id,cols,rows}`, `list_harnesses`, `diagnose_harnesses`,
`save_workspace {json}`, `load_workspace`, `export_report {path,contents}`,
`answer_approval {id,answer}`, `get_bus_info`, `add_edge {a,b}`,
`remove_edge {a,b}`, `default_workspace_root`, `is_git_repo {path}`,
`create_worktree {repo,name}`, `remove_worktree {repo,path}`, `list_memory`,
`remember {key,value}`, `forget_memory {key}`, `list_tasks`,
`add_task {title,details}`, `remove_task {id}`, `set_allow_hiring {on}`.

Launching is optimistic. `launchAgent` puts a stand-in node on the canvas
before it touches git or spawns anything, because creating a worktree and
starting a CLI takes a second or two and the click would otherwise do nothing
visible. The stand-in carries `data.pending`, has no Bus node behind it, and is
excluded from the saved workspace; anything that reaches the backend has to
check for it.

`list_harnesses` returns `{name, label, available, bus}`. `bus` is false for
CLIs with no drivable MCP support; they still run as terminals.
`diagnose_harnesses` is the slow version behind the Diagnostics sheet: it also
returns `version`, `path` and a plain-English `wiring`, and runs the CLIs
through a login shell under a timeout.

A node's `role` lives on the Bus, not the canvas. `brief()` returns it, so
`list_peers` tells an agent what each of its peers is *for* — that is what
turns a row of identical CLIs into a team. Anything that renames or re-roles a
node has to go through the Bus or the two views disagree.

`agent-output` carries raw pty bytes, escape codes included. It goes straight
to the emulator and never through the store: the terminal owns its scrollback
and already batches writes onto an animation frame.

Events to the frontend: `agent-output {nodeId, chunk}`,
`agent-status {nodeId, status}`,
`bus-event {kind: "message"|"task"|"approval"|"edges"|"memory"|"comm"|"notice", ...}`.
A `task` event carries `action: "added"|"claimed"|"done"|"removed"`; the
frontend drops the task on `removed` and upserts it otherwise.

MCP tools: `list_peers`, `get_peer_context`, `list_canvas`, `message_peer`,
`check_inbox`, `hire_agent`, `add_task`, `list_tasks`, `claim_task`,
`complete_task`, `remember`, `recall`, `forget`, `get_node_status`,
`wait_for_nodes`, `ask_user`.

`hire_agent` is the only tool that starts a process. It goes to `POST /hire`,
which checks the operator's switch, the agent cap, the name, and the harness
*before* spawning; joins the new agent to the one that asked for it; and emits
`bus-event {kind:"node"}` so the canvas learns about a node it never launched.
`launch_agent` writes files and spawns a pty, so the route runs it under
`spawn_blocking` rather than on an axum worker.

## What an edge actually does

An edge is a row in `BusShared.edges` and it gates exactly two things: whether
`message_peer` will deliver, and whether `get_peer_context` will return a
peer's screen. Nothing is pushed across it. An agent finds out what a peer did
only by calling a tool.

The rule: **the shape of the canvas is public, content needs an edge.**
`list_canvas` and `/status` return names, harnesses and statuses for every node
so an agent can ask the operator for a connection it does not have. Only
`/peer/{id}?as={me}` returns a screen, and it is the one route that checks
`connected()`. It used not to: `get_peer_context` read `/state?node=<peer>`,
which returned whatever node id it was handed, and `list_canvas` handed out
every id on the canvas. `tests/mcp_bridge.rs` covers this now.

`as` always comes from the MCP bridge's own argv, which the spawner sets. An
agent cannot claim to be another node.

### Why connected agents still did not share anything

This was the first real bug report: opencode invented a name on its own node,
the connected Claude Code was asked about it, and answered "I don't know of a
spell called OpenClaude." Every part of the plumbing worked. Nothing had ever
told the agent there was somebody to ask.

`mcp::briefing` fixes it. MCP's `InitializeResult.instructions` is a standard
field that clients fold into the model's system prompt, so one briefing covers
every harness without a per-CLI hack. It tells the agent which node it is, that
a peer's terminal is invisible to it, that nothing it prints reaches anyone,
and — the part that actually changed behaviour — that an unfamiliar name is far
more likely to be a peer's work than a mistake, so it must call `list_peers`
and `recall` before answering that something does not exist.

Two things learned tuning it, both verified against real CLIs:

- Saying "call these tools when relevant" is not enough. The agent knew it was
  on a canvas and could recite its node id, and still answered a question about
  a peer's invention from its own knowledge. The rule had to name the wrong
  answer ("unknown", "not a real thing", "a typo") and forbid it before
  looking.
- Claude Code needs `--allowedTools mcp__bus`. `--permission-mode acceptEdits`
  covers edits, not MCP calls, so every `list_peers` stopped for a
  confirmation. The Bus tools touch no files and run no commands, and putting
  an agent on the canvas is the operator agreeing to them.

`tests/live_harness.rs` asserts the behaviour against each installed CLI.

## Agents are real terminals

Each agent is the CLI as the user would run it, on the far end of a pty, drawn
by an emulator in the node. There is no headless mode and no transcript
rebuilt from JSON.

This was not the first design. The canvas used to run `claude -p "…"` per turn
with stdin closed and reconstruct a transcript from stream-json. It rendered
what an agent said but there was no way to answer it — permission prompts,
slash commands and shift+tab all need a keyboard on the far end of a pty — so
the app had to force `--permission-mode acceptEdits` and every prompt started a
new process. Parsing also had to be written per CLI, which is why eight of the
twelve harnesses could show output but nothing structured.

What the change costs: per-agent token and cost counts are gone. They came from
the `result` message in stream-json, and a TUI does not report them. Claude
Code writes them to its session JSONL under `~/.claude/projects/`, so that is
where they would come back from.

- Every CLI is launched through `$SHELL -l -c 'exec …'`. An app bundle started
  from Finder inherits almost no PATH, and each of these CLIs lives somewhere a
  login shell adds — homebrew, nvm, bun, pnpm, cargo. The same shell answers
  `list_harnesses`, once, cached for the process.
- Drop the pty slave immediately after spawning. While this process holds it
  open the master never reaches EOF, and an agent that has quit reads as
  running forever.
- Status is inferred from silence. A TUI animates while it works and goes quiet
  at its prompt, so 700ms without a byte means idle. There is no exit code to
  read any more: the process lives across turns.
- `vt100::Parser` keeps each agent's screen server-side. `output_tail`, which
  is what a peer reads through `get_peer_context`, is that screen rather than
  the stream of repaints that produced it. Refreshed on a timer, not per chunk.
- A first prompt is queued until the pty has been silent for 450ms. Typed into
  a CLI still painting its welcome screen it is simply swallowed.
- Prompts are delivered as a bracketed paste when the CLI has asked for one
  (`vt100` tracks the mode), then Enter after a beat. Sent in the same write,
  the Enter arrives before the text is in the input box. Without bracketed
  paste, newlines are flattened to spaces — otherwise each one submits.
- Reads are raw bytes, so a multi-byte character can straddle a chunk. `take_utf8`
  keeps the incomplete tail for the next read and drops bytes that can never be
  valid, which would otherwise stall the stream behind them.
- An idle recipient gets a peer message typed into its terminal, so it acts on
  it now instead of the next time somebody prompts it. A busy one is left alone
  and reads its inbox when it next checks.
- Interrupt cancels the turn and leaves the session up: Escape for Claude Code
  and the Gemini-family CLIs, Ctrl-C for the rest.

## The emulator inside a zoomed canvas

xterm measures its container with `getComputedStyle` and its glyphs with
`offsetWidth`. Both report layout values, which CSS transforms do not touch —
that is what lets a real terminal live inside ReactFlow's zoom. The emulator
lays out as if at 1:1 and the canvas scales finished text, so it stays sharp at
any zoom instead of resampling a bitmap.

- Terminals are owned by `terminals.ts`, not by React. A node that unmounts for
  any reason must not lose an agent's scrollback, and output that arrives
  before a node is on screen is buffered until there is a terminal to take it.
- `measure()` has to succeed, and retries per frame until it can. xterm cannot
  measure a glyph before its font loads, and a terminal left at the default 24
  rows paints more rows than the node is tall — xterm positions its screen
  layer absolutely, so those rows spill out over the window's own footer.
  `.term-host .xterm` is clipped as well, for the frames in between.
- `.xterm-viewport` is painted solid black by xterm's own stylesheet. The
  window here is translucent over the desktop, so both it and `.xterm-screen`
  are forced transparent and the node's surface shows through.
- Surface colours are read back out of the stylesheet at runtime so a terminal
  can never disagree with the window around it. The sixteen ANSI slots live in
  `palettes.ts` instead: no stylesheet uses them, and a CSS variable nothing
  reads is not a variable.
- Terminals are outside React, so a theme change has to be pushed to them.

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
- Agent windows default to 624x392 so the CLI inside gets about the 80 columns
  its layout is drawn for. `agentSlot` spaces new nodes from `NODE_SIZE`; a
  hardcoded stride overlaps them the moment the default changes.
- Wire in the Bus without taking anything else away. Pointing a CLI's config
  directory at a scratch folder is the easy way to add an MCP server and it
  silently removes the user's models, agents and credentials. `CODEX_HOME` did
  exactly that and left codex unable to find its own `auth.json`; codex now
  takes `-c mcp_servers.bus.…` on the command line, and opencode gets
  `OPENCODE_CONFIG` pointed at a copy of its own config with the Bus added.
- A prompt is not fire and forget. A CLI still painting, or sitting on a trust
  dialog, takes the keystrokes and drops them without a word. `pty::pump` holds
  each prompt until the agent is quiet, types it, watches for its longest word
  to appear on screen, retypes up to three times, then raises a notice. The
  marker is one word because a TUI wraps at spaces.
- Strip agent-session markers from a launched CLI's environment
  (`CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, …). An agent on the canvas is
  nobody's subagent, and Claude Code turns off transcript saving when it thinks
  it is one.
- The live tests need `AGENT_CANVAS_BRIDGE_EXE`, because `current_exe()` in a
  test is the test binary and it has no `--bus-mcp` mode. Debug builds only.
- The same binary runs as the GUI and as the MCP bridge. `main.rs` dispatches on
  `--bus-mcp` before any GUI code.
- `generate_context!` panics without `src-tauri/icons/icon.png`. Regenerate the
  set with `npm run tauri icon assets/logo.png`.
- The working folder is chosen by the operator and defaults to their home
  directory. Never hardcode a path.
- `window.canvas` and `window.terminals` exist in dev builds only, for driving
  the canvas from a console where Tauri commands are unavailable. `terminals`
  is how you put believable output on a node without a backend.
- First `cargo check` builds the whole Tauri stack. Expect minutes.
- A zustand selector that builds a fresh array is a new value every render, and
  the component re-renders for ever. `AgentNode` reads `s.edges` and derives the
  peer list in a `useMemo` for exactly this reason. React's "getSnapshot should
  be cached" warning is the tell, and it arrives as a blank window.
- ReactFlow's `onNodeContextMenu` never sees a right-click inside an agent's
  terminal: the emulator's element is created outside React, so the event fell
  through to the pane and the operator got the canvas menu on top of a node.
  `Canvas` handles `contextmenu` once and reads the node id off the DOM with
  `closest('.react-flow__node')`.
- `CSS.escape` is missing from jsdom. Anything in the store that finds a node's
  element by id needs the stub in `src/test-setup.ts`.
- An agent's name lives on the Bus, not the canvas. Peers read it out of
  `list_peers`, so a rename that only changed `data.label` would leave the two
  views disagreeing; `rename_agent` goes through `BusShared::rename_node`.
- Right-hand chrome shares one column. Approvals and the traffic panel were both
  `position: absolute; top: 50px; right: 14px` and drew on top of each other;
  they are now children of `.right-dock`, which is `pointer-events: none` so an
  empty dock does not eat clicks meant for the canvas.
- `list_tasks` used to hand back a `HashMap`'s values, so the board came out in
  a different order on every call — and "claim the first one that is open" is
  the whole protocol between a planner and a builder. Tasks carry a monotonic
  `seq` and the list is sorted by it.
- A task somebody has claimed cannot be removed. It is their current work, and
  the operator's way out is to interrupt that agent, not to delete the thing
  they are holding.
- Probing a CLI for its version has to be able to give up. An installed CLI
  that is wedged on a login prompt sits on `--version` forever, and the
  diagnostics panel would never paint. `shell_capture` polls `try_wait` and
  kills the child at the ceiling. It also caps each command's output, because
  nothing drains the pipe while it waits.
- Ask for notification permission on the first notification, never at startup.
  A system prompt in front of someone who has not yet seen the app do anything
  is how you get a permanent no.
- A team's briefs all end by telling the agent to wait. Launching a team should
  cost nothing until the operator sends the first instruction — and the demo is
  better for it, because the whole team then moves at once.
- A hired agent must be connected to whoever hired it. An agent nobody is
  joined to cannot be seen, messaged, or given work, so hiring one and leaving
  it stranded is a bug that shows up only as silence.
- The canvas only ever placed nodes it launched itself. An agent started by
  another agent arrives as a `node` bus-event, and `addAgentCanvasNode` has to
  find it a free slot — there is no stand-in reserving one.
- Every OS difference lives in `platform.rs`: finding a CLI, probing its
  version, and building the pty command. macOS goes through a login shell
  because an app bundle from Finder has almost no `PATH`; Windows resolves
  `PATH`/`PATHEXT` in-process and passes arguments one at a time, because
  `claude.cmd` is a script `CreateProcess` will not run and `C:\Users\First
  Last` is a path no hand-written quoting survives.
- `macOSPrivateApi` stays in the base `tauri.conf.json`, not in
  `tauri.macos.conf.json`. Tauri checks the `tauri` crate's features against
  the config it merged *for that target*, a macOS-only config file is not
  merged into a Windows build, and target-scoped Cargo features do not satisfy
  the check either — so splitting them breaks every Windows build.
- Windows has no native window frame here (`decorations: false`), so the app
  draws its own minimise/maximise/close. macOS keeps its traffic lights, which
  is why `.titlebar` is padded 84px on the left there and not on Windows.
- Any `std::process::Command` this app runs goes through `platform::quiet`, or
  it flashes a console window on Windows.
- Launching an agent reveals it rather than re-framing the canvas. `frameAll`
  shrinks every terminal a little more with each launch and moves the window the
  operator was reading; `revealNode` pans only when the node is off screen and
  never touches the zoom.

## Verify

```sh
npm run typecheck && npm run build && npm test
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

`npm test` runs the frontend suite then the Rust one. The frontend tests cover
the store and the terminal registry under jsdom; `src/test-setup.ts` stubs the
browser APIs jsdom lacks (`matchMedia`, `ResizeObserver`, `CSS.escape`, and a
working `localStorage`).

Anything visual needs a real browser as well as a passing test: `npm run dev`,
then drive the canvas from the console with `window.canvas` and
`window.terminals`. The infinite-render bug above typechecked, passed the suite,
and painted an empty window.

The Rust suite includes real ptys: `tests/pty_session.rs` runs actual processes
and asserts output arrives, typed prompts land, a swallowed prompt is retyped
and then given up on, and a peer message reaches an idle agent's terminal.

```sh
node examples/verify.mjs
```

runs the three projects in `examples/`. All red on a fresh checkout. They are
how a change to launching, wiring or hiring gets checked against real agents
without anybody having to read terminal output and decide.

```sh
npm run test:live
```

runs the ignored tests against the CLIs installed on this machine: each one is
launched through the real path, connected to a peer that knows something it
does not, and asked about it. A CLI that cannot run here — not logged in, a
model its account cannot use, a hook of the user's own awaiting approval —
skips with the reason rather than failing, because it was never asked the
question.
