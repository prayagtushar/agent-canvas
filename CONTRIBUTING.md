# Contributing

Issues and pull requests are welcome. This is a small project with one
maintainer, so the fastest path to a merged change is a short conversation
before the work rather than after it.

## Ways to help

**Report a harness that does not work.** Six CLIs are wired to the Bus and only
two have been run end to end. If you have Codex, Gemini CLI, Qwen Code or crush
installed, running the canvas against it and saying what happened is the single
most useful thing you can file. Include the CLI, its version, your OS, and what
the **Diagnostics** sheet says.

**Report a bug.** Use the
[bug template](https://github.com/prayagtushar/agent-canvas/issues/new?template=bug.yml).
The parts that matter are what you expected, what happened instead, and enough
detail to reproduce it. A screenshot helps for anything visual.

**Suggest a feature.** Use the
[feature template](https://github.com/prayagtushar/agent-canvas/issues/new?template=feature.yml)
and describe the problem before the solution. Several features here started as
somebody explaining a workflow that did not fit.

**Send a pull request.** For a typo or a small fix, open one directly. For
anything larger, open an issue first. It beats finding out after the work is
done that the feature belongs somewhere else.

## Setting up

You need [Bun](https://bun.sh), a Rust toolchain, and at least one agent CLI on
your `PATH`: Claude Code, Codex, Gemini CLI or opencode.

```sh
bun install
bun run tauri dev
```

The first build takes a few minutes. After that it is fast.

Node is still required, but only for the projects in `examples/`. Those run on
`node --test` and are meant to stay dependency-free.

## Before you write code

Read [AGENTS.md](AGENTS.md). It has the module layout, the API contract between
the frontend and Rust, and the rendering rules that are easy to break in a
transparent window without noticing. Most of it exists because something went
wrong once, and each note says what.

## Before you open the pull request

```sh
bun run typecheck && bun run build && bun run test
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

CI runs all of it on macOS, Windows and Linux, so it is quicker to find out
locally. If you changed how agents launch, wire together or hire each other,
also run the example projects:

```sh
bun run examples
```

New behaviour that can break usually deserves a test.
[docs/testing.md](docs/testing.md) says where each kind lives.

## A passing suite is not evidence for a UI change

Look at it in a real window. `bun run tauri dev`, not the browser.

`bun run dev` serves the interface in a browser for design work, but there is no
backend behind it: a tab cannot spawn a process, so every command throws. The
canvas says so when you open it there. It is useful for checking layout and
useless for checking behaviour.

The bugs that got furthest in this project all typechecked and passed the suite.
An infinite render that painted an empty window. A context menu that opened over
a terminal. A panel that grew past the bottom of the screen with no way to
scroll. None of them were catchable without looking.

## Style

Match the file you are editing. There is no separate style guide, and the
formatters settle the rest: `cargo fmt` for Rust, and the `.editorconfig` at the
root for everything else.

Comments are for the reason, not the mechanism. If a line looks wrong until you
know one fact, write that fact down.

## Commits and pull requests

Say what changed and why the old behaviour was not good enough. The why is the
part nobody can reconstruct later.

The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) asks how you
checked the change. "Tests pass" is not an answer for anything visual.

Pull requests are squashed on merge, so the branch history is yours to keep
messy.

## Security

Do not open a public issue for a vulnerability. Use a
[private advisory](https://github.com/prayagtushar/agent-canvas/security/advisories/new).
[SECURITY.md](SECURITY.md) has the threat model, including what counts as a bug
here and what is the product working as designed.

## Code of conduct

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md). The short
version: be decent to people, and assume they are acting in good faith.
