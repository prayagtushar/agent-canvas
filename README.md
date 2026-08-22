<p align="center">
  <img src="assets/logo.png" width="88" alt="Agent Canvas">
</p>

# Agent Canvas

[![CI](https://github.com/prayagtushar/agent-canvas/actions/workflows/ci.yml/badge.svg)](https://github.com/prayagtushar/agent-canvas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://tauri.app)

Run several AI coding CLIs at once on one canvas, and let them hand work to each
other.

Each agent is a real child process with its own harness, account, and working
directory. You draw the connections that decide who can see whom. The window is
transparent, so your desktop wallpaper shows through behind the work.

## What it does

Every agent is a terminal window you can move, resize, and wire to another one.
Underneath sits a local coordination server, the Bus, that agents reach as a
real MCP server.

- An agent sees only the peers you connected it to. No edge, no visibility.
- Agents create, claim, and finish tasks on a shared board. A claim is
  exclusive, so two agents cannot pick up the same task.
- Agents read and write one shared memory instead of each keeping its own.
- An agent can stop and ask you a question. It blocks until you answer.
- Each agent can get its own git worktree, so concurrent edits never collide.

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
     claude -p ... --mcp-config <generated>   ← written by the spawner
```

When the app spawns an agent, it writes an MCP config pointing at its own
executable in `--bus-mcp` mode. That subprocess talks JSON-RPC over stdio with
the agent and forwards tool calls to the Bus over HTTP. Agents call real MCP
tools. Nothing wraps the prompt and nothing scrapes output.

### Tools an agent gets

| Group | Tools |
| --- | --- |
| Discovery | `list_peers`, `get_peer_context`, `list_canvas` |
| Messaging | `message_peer`, `check_inbox` |
| Tasks | `add_task`, `list_tasks`, `claim_task`, `complete_task` |
| Memory | `remember`, `recall`, `forget` |
| Dependencies | `get_node_status`, `wait_for_nodes` |
| Escalation | `ask_user` |

## Harnesses

"Bus" means the CLI can be wired to the tools above. The others still run on the
canvas as terminals. Anything missing from your `PATH` shows greyed out in the
launcher.

| CLI | Bus | Run against it |
| --- | --- | --- |
| `claude` (Claude Code) | yes | yes |
| `opencode` | yes | yes |
| `codex` (Codex) | yes | not yet |
| `gemini` (Gemini CLI) | yes | not yet |
| `qwen` (Qwen Code) | yes | not yet |
| `crush` | yes | not yet |
| `goose`, `aider`, `amp`, `cursor-agent`, `copilot`, `droid` | no | not yet |

Adding one takes a row in `HARNESSES` and a match arm in `start_process`, both
in [`src-tauri/src/spawn.rs`](src-tauri/src/spawn.rs).

## Running it

You need Node 18 or newer, a Rust toolchain, and at least one agent CLI on your
`PATH`.

```sh
npm install
npm run tauri dev
```

For a bundle:

```sh
npm run tauri build
```

Pick a working folder from the toolbar, launch an agent from the left rail, drag
between two agents' green dots to connect them, then ask one to `list_peers`.

### Keyboard

| Key | Action |
| --- | --- |
| `⌘K` | Focus the command bar |
| `⌘S` | Save the workspace |
| `⌘F` | Find an agent or note |
| `⌘.` | Interrupt everything running |
| `⌘\` | Toggle focus mode |
| `?` | Show all shortcuts |

## Security

Agents run as you, with your files, your environment, and your credentials.
Claude Code launches with `--permission-mode acceptEdits`, so it writes files in
its working directory without asking. Pick that folder deliberately, and turn on
the per-agent worktree option when several agents share a repository.

Treat agent output as untrusted input. Anything an agent reads, from a file, the
web, or a peer, can steer what it does next.

The Bus binds to `127.0.0.1` on a random port and checks a bearer token on every
route, including `/health`. The token is new on each launch, is written only into
per-agent config files under your cache directory, and never leaves the machine.

Found a vulnerability? Open a [private advisory](https://github.com/prayagtushar/agent-canvas/security/advisories/new)
rather than a public issue.

## Tests

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

`tests/bus_flow.rs` covers peer scoping, edge-gated messaging, the task
lifecycle, human escalation, and disconnection.

## Status

Pre-1.0. The coordination core has test coverage, and I use the Claude Code and
opencode adapters regularly. The rest come from each CLI's documented flags and
nobody has run them yet, so reports on those are the most useful thing you can
file.

## Contributing

Read [AGENTS.md](AGENTS.md) first. It has the layout, the API contract, and the
rendering rules that are easy to break in a transparent window.

Before a PR, run the four commands at the bottom of that file. One rule worth
repeating here: a browser screenshot does not prove a UI change works, because
WebKit composites differently inside this window. Check `npm run tauri dev`.

## License

MIT. See [LICENSE](LICENSE).

Bundles [Geist Sans](https://github.com/vercel/geist-font) and
[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), both under the SIL
Open Font License.
