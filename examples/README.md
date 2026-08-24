# Examples

Three folders you can point Agent Canvas at. Each one is a small project with
a failing test suite, and each one is finished when the suite passes — so
whether the agents actually did the work is a question with an answer, not a
matter of reading their output and hoping.

Nothing here installs anything. They all run on Node's own test runner.

| Example | What it asks for | Team to use |
| --- | --- | --- |
| [fix-the-tests](fix-the-tests) | Four bugs, nine tests, five red | Review pair |
| [two-heads](two-heads) | One agent knows a fact the other needs | Review pair |
| [build-the-api](build-the-api) | Fifteen tests, an empty `src/` | Orchestrator |

Start with **fix-the-tests**. It is the shortest and it proves the basics work
on your machine.

**two-heads** is the one worth running twice: once as written, and once with
the wire between the two agents deleted. The second run fails, because the
frontend agent has no way to learn what the backend agent knows. That is the
claim this whole app is built on, settled by a test rather than a demo.

**build-the-api** is the full orchestration path, including one agent hiring
two more.

## Checking

From the repository root:

```sh
node examples/verify.mjs
```

That runs every example and prints a line each. On a fresh checkout all three
are red, which is the correct starting state. Pass a name to check one:

```sh
node examples/verify.mjs two-heads
```

## Starting over

The examples are just files in git, so:

```sh
git checkout examples && git clean -fd examples
```

## Before you start

Each example is the same three steps: set the working folder, click one team,
paste one prompt. The example's README has the exact wording.

Two things worth knowing:

- Agents write to the folder you point them at. That is the point, and it is
  why these examples are throwaway directories inside the repo rather than
  anything you care about.
- Turn on **Own git worktree per agent** in Settings if you would rather each
  agent work on its own branch. The examples pass either way.
