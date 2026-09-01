# Build it from the spec

An empty `src/` and fifteen tests describing what should be in it.

`SPEC.md` says what `createStore()` must do. `test/notes.test.js` is the same
thing as assertions. Nothing exists yet, so the suite does not even load.

## Run it

1. Set the working folder to **this folder** (`examples/build-the-api`).
2. Start the **Orchestrator** team from the empty canvas. That is one Claude
   Code agent.
3. Send it:

```
Read SPEC.md and test/notes.test.js, then build src/notes.js so that `bun run test` passes all fifteen. Split the work: hire two opencode agents, give each one a part of the spec and tell it which files it owns, and put the parts on the shared board. You integrate and run the tests. Do not edit anything under test/.
```

## Check it

```sh
node examples/verify.mjs build-the-api
```

## What this is testing

The full orchestration path: one agent reads a spec, breaks it into parts,
**hires its own workers**, hands them tasks off the shared board, and puts the
result together. Watch the canvas — two windows you did not open should appear
within a minute, each wired to the lead.

If you would rather do the staffing yourself, start the **Plan, build, verify**
team instead and send the same instruction without the hiring sentence.
