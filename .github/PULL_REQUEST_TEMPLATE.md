## What this changes

<!-- What it does, and why the current behaviour was not good enough. -->

## How you checked it

<!-- Not "tests pass". What did you run, and what did you see? A UI change
     needs a real window: the browser preview has no backend behind it. -->

- [ ] `bun run typecheck && bun run build && bun run test`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [ ] Anything visual was looked at in `bun run tauri dev`
- [ ] Touched launching, wiring or hiring? `node examples/verify.mjs`

<!-- New behaviour that can break usually deserves a test. AGENTS.md says
     where each kind of test lives. -->
