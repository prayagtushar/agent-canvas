# Testing

```sh
bun run test
```

Runs the frontend suite and then the Rust one. The frontend suite runs anywhere.
The Rust one runs on macOS and Linux; on Windows the tests compile but cannot
start, for a reason recorded in [AGENTS.md](../AGENTS.md), while the app itself
builds and runs there.

| Suite | What it covers |
| --- | --- |
| `src/store.test.ts` | window placement, optimistic launch and its rollback, the Bus owning the wire graph, unread counts, distinct agent names, prompt history, the traffic log, panning to a node without changing zoom, launching a team and saving one, the finished-work notification |
| `src/report.test.ts` | the session report: the numbers at the top, names never ids, empty sections that say so, a transcript containing a code fence |
| `src/teams.test.ts` | the built-in teams wire up, and teams you saved survive a corrupt store |
| `src/terminals.test.ts` | output buffered before a node exists, scrollback surviving a remount, keystrokes reaching the right pty |
| `tests/bus_flow.rs` | peer scoping, edge-gated messaging, the message cap, the task lifecycle, human escalation, renames peers can see, board order, work in progress that cannot be deleted |
| `tests/mcp_bridge.rs` | the real MCP bridge over stdio: tool discovery, the briefing, a peer's screen readable only across a wire, blocking waits |
| `tests/pty_session.rs` | real processes on real ptys: output arriving, prompts landing, a swallowed prompt retyped then given up on, a message typed into an idle agent |
| `tests/worktrees.rs` | a real git repo: branch per agent, edits isolated, asking twice; and diagnostics answering for every harness without hanging |

## The example projects

[`examples/`](../examples) has four small projects, each with a failing test
suite and the exact prompt to send. They finish when the suite passes, so
whether the agents actually did the work is a question with an answer.

```sh
bun run examples
```

All four are red on a fresh checkout. That is the starting state, and the point.

Start with `fix-the-tests`. Then run `two-heads` twice, once as written and once
with the wire between the two agents deleted. The second run fails, because
without a connection neither agent can reach what the other knows. `ask-first`
leaves two decisions out of the spec that only you can make, so the agent has to
stop and ask. `build-the-api` is the longest of the four.

## Against real CLIs

```sh
bun run test:live
```

Runs the ignored tests against the CLIs installed on your machine. Each one is
launched the way the app launches it, connected to a peer that knows something
it does not, and asked about it. A CLI that cannot run, whether it is not logged
in, on a model your account cannot use, or waiting on a hook of your own, is
skipped with the reason.

These spend real credits.

## A passing suite is not evidence for a UI change

Look at it in a real window. `bun run tauri dev`, not the browser.

`bun run dev` serves the interface in a browser for design work, but there is no
backend behind it: a tab cannot spawn a process, so every command throws. The
canvas says so when you open it there. It is useful for checking layout and
useless for checking behaviour.
