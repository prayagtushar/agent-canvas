# Your first canvas

Two agents, one small broken project, and a test suite that goes from red to
green. Everything here runs on opencode's free models, so it costs nothing.

Budget half an hour, most of it spent watching. Free models are slower than the
paid ones, and a single agent took about fifteen minutes on the project below.
It did finish: all nine tests, four real bugs, no cheating on the test file.

If you have never run a coding agent before, this is the page to start on. It
assumes nothing except that you can open a terminal.

## What you need

One CLI, and an account for it.

```sh
curl -fsSL https://opencode.ai/install | bash
```

Homebrew (`brew install anomalyco/tap/opencode`), npm
(`npm install -g opencode-ai`), scoop and choco all work too. Then:

```sh
opencode auth login
```

Pick **OpenCode Zen** and paste the key from
[opencode.ai/auth](https://opencode.ai/auth). Signing up asks for billing
details even though the models below bill nothing, which is worth knowing
before you start rather than halfway through.

You do not need Claude Code, Codex or Gemini CLI for any of this.

## 1. Choose a free model

```sh
opencode models
```

The ones whose names end in `-free` cost nothing, and so does
`opencode/big-pickle`, which does not advertise it:

| Model | Good for |
| --- | --- |
| `opencode/nemotron-3-ultra-free` | The largest of them. Start here. |
| `opencode/nemotron-3.5-lightning-free` | Faster, weaker. Fine for the Reviewer. |
| `opencode/mimo-v2.5-free` | A second opinion that is genuinely a different model |
| `opencode/big-pickle` | Free too, despite the name saying nothing either way |

Make one of them the default by writing `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/nemotron-3-ultra-free"
}
```

**This is the step that matters for Agent Canvas.** When the app starts an
opencode agent it copies that file, adds the Bus to it, and hands the copy to
the agent. Your model choice carries into every agent on the canvas, and your
own config is never edited. There is no model picker in the app, and this is
why: one line here decides it for every agent you start.

Check it took:

```sh
opencode run "reply with the word ready"
```

The header line above the reply names the model that answered.

## 2. Get something to fix

Clone the repository. It ships four throwaway projects for exactly this.

```sh
git clone https://github.com/prayagtushar/agent-canvas
cd agent-canvas
node examples/verify.mjs fix-the-tests
```

Red, and it should be. `examples/fix-the-tests` is a shopping cart with four
bugs in it and nine tests, five of them failing. Nothing to install: it runs on
Node's own test runner.

Have a look at `examples/fix-the-tests/src/cart.js` before the agents do. It is
about forty lines, and knowing what is wrong with it is what makes the next
part worth watching.

## 3. Open the canvas on that folder

Start Agent Canvas, from a release or from source:

```sh
bun install
bun run tauri dev
```

Click **Choose a folder** in the bottom-left toolbar and pick
`examples/fix-the-tests`. Agents only ever run in the folder you name, so this
is not a formality. Pick the wrong one and they will edit the wrong project.

## 4. Start two agents

The empty canvas offers four teams. Take **Review pair**: one agent writes, the
other reads what it wrote and objects.

Each card names the CLIs it will actually start underneath. On a machine where
opencode is the only one installed, Review pair says `opencode ×2`, because a
team falls back to what you have rather than refusing to run. Two agents on one
model still disagree with each other more usefully than one agent agreeing with
itself.

Two windows appear, wired together. Each is a real terminal running a real
`opencode` process. Type into one and it responds, exactly as it would in your
shell. Nothing has been spent yet: both were told to confirm their role and
wait.

## 5. Send one instruction

In the command bar at the bottom, set the target to **Everyone**, then send:

```
Run `bun run test`. Four behaviours in src/cart.js are wrong and the suite says
exactly what each should do. Fix them and get all nine tests passing. Do not
change anything under test/.
```

Both agents get it at once. Now watch four things.

- **The dot on each window.** Green while the process is working.
- **The wire.** A bead runs along it every time one agent messages the other.
  The bead and the `[message from ...]` line in the transcript are the same
  colour, so the bead explains the line that follows it.
- **⌘J**, which is every message that has crossed a wire this session, in one
  list.
- **⌘O**, the office. The same canvas as a pixel-art room, where an agent
  walks to its peer's desk to deliver a message and stands at the whiteboard
  when it writes to shared memory. It is reading real events, not miming.

The Maker will edit `src/cart.js`. The Reviewer's job is to catch a "fix" that
edits the test instead of the bug, which is the failure mode you should expect
from a small model.

## 6. Check whether they actually did it

```sh
node examples/verify.mjs fix-the-tests
```

Green means the suite passes. Nothing either agent said counts here, and that
is the point of using a project with a test suite instead of a demo. If it is
still red, read the output, tell the agents what is still failing, and send it
again. That is a normal second lap, not a failure of the setup.

To put it back:

```sh
git checkout examples && git clean -fd examples
```

## 7. The one that proves the point

Run `examples/two-heads` twice.

Four values are written down in exactly one place, and only one of the two
agents is told that file exists. The other has to write those four values into
`src/config.js`. Every one of them has an obvious wrong guess, so an agent
working alone gets them wrong.

Run it as written and it passes. Then run it again with the wire between the
two agents deleted, and it fails, because the second agent has no way to learn
what the first one knows. A wire is permission, and that is a claim settled by
a test rather than by a diagram.

## When it does not work

| What you see | What it is |
| --- | --- |
| The team button is greyed out | No CLI on your `PATH`. Open the diagnostics panel, the ⓘ on the left rail, which says what it looked for and where |
| "No agent CLIs found" on the empty canvas | Same thing. Install opencode and reopen the app |
| An agent starts and immediately exits | Usually not signed in. Run `opencode` on its own in a terminal once |
| The agents ignore each other | Check there is a line between them. Delete it and draw it again by dragging from one window's edge to the other |
| A model that is not the one you set | The app copies `~/.config/opencode/opencode.json` when the agent starts, so restart the agent after editing it |
| Everything stops mid-run | The turn budget, top-left. It exists so two agents talking in circles overnight is not a bill. Click it to raise the cap |

Free models are smaller and slower than the paid ones and it shows. They lose
track of a long instruction, and they will occasionally "fix" a test rather than
the code, which is the Reviewer's whole job to catch. Expect to send a second
message telling them what is still failing. That is a normal lap, not a broken
setup.

They do get there. `opencode/nemotron-3-ultra-free` was given the prompt above
on `fix-the-tests` and took all nine tests green on its own, in about fifteen
minutes, without touching anything under `test/`.

Nothing about the canvas changes when you point it at a better model later, so
learn the shape of it here for nothing first.

## Next

- [Teams](teams.md), including saving your own and letting an agent hire its own crew
- [Architecture](architecture.md) for what a wire actually grants and the full tool list
- [The office](office.md) for what each movement in the room means
- [Keyboard](keyboard.md) for the shortcuts
- [The other examples](../examples), including one that fails if the agent guesses instead of asking
