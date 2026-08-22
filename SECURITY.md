# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub's advisory form](https://github.com/prayagtushar/agent-canvas/security/advisories/new)
rather than opening a public issue. I aim to acknowledge within a few days.

## Threat model

Agent Canvas launches AI coding CLIs as child processes on your machine. It is
a tool for running code you intend to run, on hardware you control. Understand
the following before using it:

- **Agents run as you.** Each spawned CLI inherits the permissions of whoever
  launched the app, including access to your files, environment, and network.
- **Claude Code is launched with `--permission-mode acceptEdits`**, which means
  it may write files in its working directory without prompting. Choose the
  working folder deliberately, and prefer the per-agent git worktree option
  when several agents share a repository.
- **Prompts and agent output are not sandboxed.** Anything an agent reads, from
  files, the web, or a peer, can influence what it does next. Treat agent
  output as untrusted input, especially before acting on it.

## The Bus

The coordination server binds to `127.0.0.1` on a random high port and requires
a bearer token on **every** route, including `/health`. The token is a fresh
UUID per launch and is written only into per-agent MCP config files under your
user cache directory. It is never logged, never committed, and never leaves the
machine.

Agents reach the Bus by running this same binary in `--bus-mcp` mode, which
proxies MCP tool calls over that authenticated local connection. An agent can
only see peers you have explicitly connected it to on the canvas.

## Supported versions

This project is pre-1.0. Fixes land on `main`.
