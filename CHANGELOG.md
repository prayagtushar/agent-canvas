# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Spatial canvas running AI coding CLIs as real child processes.
- The Bus: peer discovery scoped to drawn connections, edge-gated messaging,
  a shared task board with exclusive claims, and human escalation via
  `ask_user` — exposed to agents as real MCP tools.
- Shared canvas memory (`remember` / `recall` / `forget`) with a Memory node.
- Optional git worktree per agent, under `.agent-canvas/worktrees/`.
- 12 harnesses behind a single table, led by Claude Code, Codex, Gemini CLI
  and opencode.
- Transparent window over macOS vibrancy, with an operator-controlled tint.
- Four themes, a keyboard shortcut overlay, and workspace persistence.
- Integration tests covering the whole coordination flow.

### Fixed
- Floating chrome rendered as a skewed slab and a clipped toolbar in the real
  window. ReactFlow `<Panel>` children are composited inside the canvas
  subtree, which a transparent WKWebView mis-transforms; chrome now lives in
  the app shell.
- Canvas nodes drew a large circular arc across their content at high zoom.
  `overflow: hidden` plus a `border-radius` gave WebKit a rounded-rect clip it
  scaled by the viewport transform; nodes no longer clip.
- `claim_task` let any agent take a task another agent already owned.
