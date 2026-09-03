# Architecture

```
┌──────────────────────────── Tauri 2 app ────────────────────────────┐
│  React frontend                │  Rust backend                      │
│  ├─ Canvas (xyflow)            │  ├─ axum HTTP server (the Bus)     │
│  ├─ terminal per node (xterm)  │  ├─ one pty per agent              │
│  ├─ zustand store              │  ├─ MCP-over-stdio endpoint        │
│  └─ workspace persistence      │  └─ git worktree management        │
└─────────────────────────────────────────────────────────────────────┘
                                   ▲
                    same binary invoked as: --bus-mcp PORT TOKEN NODE_ID
                                   │
        claude --mcp-config <generated>   ← on a pty, through your shell
```

When the app spawns an agent, it writes an MCP config pointing at its own
executable in `--bus-mcp` mode. That subprocess talks JSON-RPC over stdio with
the agent and forwards tool calls to the Bus over HTTP. Agents call real MCP
tools. Nothing wraps the prompt and nothing scrapes output.

Each CLI is started through your login shell, so it finds the same PATH, and
runs interactively for as long as the node is open. A prompt sent from the
canvas is typed into it. One agent messaging another that happens to be idle is
typed in too, so it acts on it straight away.

## What a connection means

Drawing a wire between two agents does two things: it lets them message each
other, and it lets each read what is on the other's screen. That is all it does.
Nothing is pushed across a wire, and neither agent is watching the other.

So an agent finds out what its peer did by asking:

| It wants to know | It calls |
| --- | --- |
| who am I connected to, and what are they doing | `list_peers` |
| what exactly did that peer do | `get_peer_context` |
| has anyone written this down for everyone | `recall` |

The rule is that the shape of the canvas is public and content needs a wire. Any
agent can see that another node exists, its name and whether it is busy, so it
can ask you to connect them. Reading what a node is actually doing takes a wire.

Because nothing is pushed, anything one agent works out stays on its own node
until it calls `remember`. If you want a decision to outlive a turn, tell the
agent to remember it, or read it off their screen from a connected peer.

## Tools an agent gets

| Group | Tools |
| --- | --- |
| Discovery | `list_peers`, `get_peer_context`, `list_canvas` |
| Messaging | `message_peer`, `check_inbox` |
| Tasks | `add_task`, `list_tasks`, `claim_task`, `complete_task` |
| Memory | `remember`, `recall`, `forget` |
| Dependencies | `get_node_status`, `wait_for_nodes` |
| Escalation | `ask_user` |

Every agent is handed a short briefing when its Bus connection opens: which node
it is, that its peers' terminals are invisible to it, that nothing it prints
reaches anyone else, and that an unfamiliar name is more likely to be a peer's
work than a mistake, so it should look before answering that something does not
exist. It arrives through MCP's own `instructions` field, so every harness gets
it without a per-CLI hack.

## Where the code lives

[AGENTS.md](../AGENTS.md) has the module layout, the API contract between the
frontend and Rust, and the rendering rules that are easy to break in a
transparent window without noticing.
