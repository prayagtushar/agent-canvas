# Changelog

Notable changes to Agent Canvas. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/spec/v2.0.0.html).

While this project is pre-1.0, a minor version may change behaviour.

## Unreleased

Everything below ships as 0.1.0, the first release, once the tag is cut.
Downloads appear on the
[releases page](https://github.com/prayagtushar/agent-canvas/releases).

### The canvas

- Agents run as real child processes in real terminals, one node each. What a
  node shows is the CLI's own interface, so permission prompts, slash commands
  and mode switches all work from the canvas.
- Supports Claude Code, Codex, Gemini CLI and opencode. The canvas launches
  whichever are on your PATH and says which it found.
- Nodes can be moved, resized, renamed, searched and focused. The window is
  transparent, with vibrancy on macOS and mica on Windows.
- Task board, shared memory and note nodes live on the canvas alongside agents.

### The office

- `⌘O` draws the canvas as a pixel-art room: a desk per agent, you at the top,
  the board and memory on the walls, and the floor divided into a work area, a
  kitchen corner and a lounge. Agents walk to a peer's desk to deliver a
  message, to the board to claim or finish work, to the shelf when they write to
  shared memory, and to your desk when they are blocked on you. A hired agent
  comes in through the door, and a cat wanders the lounge.
- Rendered on a canvas at whole-number scale and never smoothed. Art is
  MetroCity (CC0) and Pixel Agents (MIT); see CREDITS.md.
- Hovering a desk shows that agent's role, status and recent peer traffic
  without leaving the office. Unread peer messages show as a badge on the
  token, and a token away from its desk casts a shadow so sitting and standing
  read apart.
- A strip along the top of the office counts agents, working agents and agents
  waiting on you, alongside the turn budget and reported spend.
- Driven by Bus events rather than by guessing from a transcript, which is what
  comparable tools are reduced to.

### Agents working together

- A wire between two agents is what lets them see each other. Connected agents
  can read each other's role, send messages, and hand over tasks.
- Agents reach a local coordination server, the Bus, as a real MCP server. It
  binds to loopback on a random port behind a per-launch bearer token.
- Four built-in teams launch a whole arrangement at once: review pair, plan and
  build and verify, orchestrator, second opinion. Teams you build yourself can
  be saved.
- With hiring enabled, an agent can start another agent itself, within the agent
  cap.
- `ask_user` puts a question from an agent in front of you and blocks that agent
  until you answer.

### Keeping it in bounds

- Turn cap and agent cap, both visible in the toolbar. Hitting the turn cap
  stops the canvas, interrupts every agent, and turns auto-comm off.
- Spend, turns and busy time per agent, read from what the CLIs print. Tokens
  and dollars are reported when a CLI prints them and left blank when it does
  not, rather than guessed at.
- Per-agent git worktrees, so several agents can work in one repository without
  editing the same files.
- A diff view for what each agent actually changed on disk.
- Session reports export to Markdown.

### Around the app

- Cross-platform releases built by GitHub Actions: a universal macOS `.dmg`, an
  `.msi` and `.exe` for Windows, and `.deb`, `.rpm` and `.AppImage` for Linux.
  These are not code-signed, so macOS and Windows both warn on first launch.
  [The README says how to get past it](README.md#install).
- Update checking, which reports plainly that a build cannot verify an update
  rather than failing at you. Signing keys are not set up yet, so every build so
  far is in exactly that state.
- Four self-verifying examples in `examples/`, red on a fresh checkout, that
  prove a change to launching, wiring or hiring still works.
