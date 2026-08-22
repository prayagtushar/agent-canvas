# Agent Canvas

A desktop workspace where several AI coding agents run as **real processes** on a
spatial canvas. They discover each other only through connections you draw,
share a task board and a common memory, message one another, and escalate
decisions back to you.

The window is transparent: your own desktop wallpaper shows through, blurred,
behind the work.

> Agent Canvas is an independent, from-scratch project inspired by
> [october.dev](https://www.october.dev/). It is not affiliated with it.

## Why

Running four agents means four terminal tabs, four sets of context, and no way
for them to hand work to each other. Agent Canvas keeps every agent a real
process with its own harness, account, working directory and credentials — and
puts a coordination layer underneath so they can actually collaborate, with you
holding scope, review, and the final decision.

## What it does

- **Canvas** — every agent is a live terminal window you can move, resize and
  connect. Sticky notes and a project card sit alongside them.
- **Scoped discovery** — an agent can only see peers you have connected it to.
  No edge, no visibility.
- **Shared task board** — agents create, claim and complete tasks. A claim is
  exclusive, so two agents never work the same item.
- **Shared memory** — one store the whole canvas reads and writes, instead of
  each agent keeping its own.
- **Human escalation** — an agent can stop and ask you a question; it blocks
  until you answer.
- **Worktree isolation** — optionally give each agent its own git worktree so
  concurrent edits cannot collide.

## How it works

```
┌──────────────────────────── Tauri 2 app ────────────────────────────┐
│  React frontend                │  Rust backend                      │
│  ├─ Canvas (xyflow)            │  ├─ axum HTTP server (the Bus)     │
│  ├─ zustand store              │  ├─ process spawner per harness    │
│  ├─ approvals + memory         │  ├─ MCP-over-stdio endpoint        │
│  └─ workspace persistence      │  └─ git worktree management        │
└─────────────────────────────────────────────────────────────────────┘
                                   ▲
                    same binary invoked as: --bus-mcp PORT TOKEN NODE_ID
                                   │
     claude -p ... --mcp-config <generated>   ← injected by the spawner
```

The trick: every spawned agent gets an MCP config pointing at **this app's own
executable** running in `--bus-mcp` mode. That subprocess speaks JSON-RPC over
stdio with the agent and proxies tool calls to the in-app Bus over HTTP. Agents
therefore call real MCP tools — no prompt wrapping, no scraping.

### Tools agents get

| Group | Tools |
| --- | --- |
| Discovery | `list_peers`, `get_peer_context`, `list_canvas` |
| Messaging | `message_peer`, `check_inbox` |
| Tasks | `add_task`, `list_tasks`, `claim_task`, `complete_task` |
| Memory | `remember`, `recall`, `forget` |
| Dependencies | `get_node_status`, `wait_for_nodes` |
| Escalation | `ask_user` |

## Supported harnesses

Bus column means the CLI can be wired to the coordination tools above. The rest
still run on the canvas as terminals.

| CLI | Bus | Runtime tested |
| --- | --- | --- |
| `claude` (Claude Code) | ✅ | ✅ |
| `codex` (Codex) | ✅ | — |
| `gemini` (Gemini CLI) | ✅ | — |
| `opencode` | ✅ | ✅ |
| `qwen` (Qwen Code) | ✅ | — |
| `crush` | ✅ | — |
| `goose`, `aider`, `amp`, `cursor-agent`, `copilot`, `droid` | — | — |

Anything not installed shows greyed out in the launcher. Adding a harness means
one row in `HARNESSES` and one match arm in `start_process`, both in
[`src-tauri/src/spawn.rs`](src-tauri/src/spawn.rs).

## Running it

Requires Node 18+, a Rust toolchain, and at least one agent CLI on your `PATH`.

```sh
npm install
npm run tauri dev
```

To build a bundle:

```sh
npm run tauri build
```

Then pick a working folder from the toolbar, launch an agent from the left rail,
drag between two agents' green dots to connect them, and ask one to
`list_peers`.

### Keyboard

| Key | Action |
| --- | --- |
| `⌘K` | Focus the command bar |
| `⌘S` | Save the workspace |
| `⌘F` | Find an agent or note |
| `⌘.` | Interrupt everything running |
| `⌘\` | Toggle Focus mode |
| `?` | Show all shortcuts |

## Security

The Bus listens on `127.0.0.1` on a random port and requires a bearer token on
**every** route. The token is generated per launch and is never written outside
the per-agent config files in your cache directory. Agents run with the
permissions of whoever launched the app — this is a tool for running code you
intend to run, on a machine you control.

## Tests

```sh
cd src-tauri && cargo test
```

`tests/bus_flow.rs` covers peer scoping, edge-gated messaging, the task
lifecycle, human escalation, and disconnection.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). [AGENTS.md](AGENTS.md) is the working
memory for the project — read it before making changes.

## License

MIT — see [LICENSE](LICENSE).
