# Contributing

Issues and pull requests are welcome.

## Before you write code

Read [AGENTS.md](AGENTS.md). It has the module layout, the API contract between
the frontend and Rust, and the rendering rules that are easy to break in a
transparent window without noticing. Most of it exists because something went
wrong once, and the note explains what.

For anything larger than a fix, open an issue first. It is a short conversation
and it beats finding out after the work is done that the feature belongs
somewhere else.

## Running it from source

```sh
bun install
bun run tauri dev
```

You need [Bun](https://bun.sh) and a Rust toolchain. The first build takes a
few minutes; after that it is fast.

Node is still required, but only for the projects in `examples/`: those run on
`node --test` and are meant to stay dependency-free, so `bun run test` in one
of them runs Node rather than Bun's own test runner.

At least one agent CLI needs to be on your PATH for the canvas to do anything:
Claude Code, Codex, Gemini CLI or opencode.

## Before you open the pull request

```sh
bun run typecheck && bun run build && bun run test
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

CI runs all of it on macOS, Windows and Linux, so it is quicker to find out
locally.

If you changed how agents launch, wire together or hire each other, also run:

```sh
node examples/verify.mjs
```

## A passing suite is not evidence for a UI change

Look at it in a real window. `bun run tauri dev`, not the browser.

`bun run dev` serves the interface in a browser for design work, but there is no
backend behind it: a tab cannot spawn a process, so every command throws. The
canvas tells you as much when you open it there. It is useful for checking
layout and useless for checking behaviour.

The bugs that got furthest in this project all typechecked and passed the suite:
an infinite render that painted an empty window, a context menu that opened over
a terminal, a panel that grew past the bottom of the screen with no way to
scroll. None of them were catchable without looking.

## Commits

Say what changed and why the old behaviour was not good enough. The why is the
part nobody can reconstruct later.
