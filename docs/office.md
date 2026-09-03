# The office

`⌘O` draws the same canvas as a pixel-art room. Every agent gets a desk and a
character in its harness colour, you get the desk at the top, and the shared
board and memory sit on the walls.

The room has areas, the way the offices this is modelled on do: a work floor
with the desks on a carpet, a kitchen corner in tile, and a lounge with a sofa
and a painting. The floor material is what divides a room into places, and it
turned out to be the single biggest difference between this and the references.

## What a movement means

It moves on things that actually happened, not on a timer.

| In the room | What it means |
| --- | --- |
| Standing at your desk, "NEEDS YOU" | That agent called `ask_user` and has stopped |
| Walking to another desk | It sent that peer a message, and the bubble is the message |
| Walking to the board | It claimed a task, or finished one |
| Walking to the shelf | It wrote something to shared memory |
| Coming in through the door | Another agent hired it |
| Typing at the desk, screen lit | Mid-turn |
| A mark above the head | Blocked on you, or carrying a message |
| The cat | Nothing at all. It is a cat |
| Faint line between two desks | They are wired together and can see each other |

Hovering a desk shows that agent's role, harness, status and its last few
messages, in a panel at the bottom of the room. Watching a token move tells you
something happened but not what, and having to leave for the canvas to find out
defeats the point of a glance view. Clicking still takes you to the canvas.

The strip along the top carries the rest: how many agents are in, how many are
mid-turn, how many are waiting on you, the turn budget, and what the CLIs have
reported spending. Cost is absent rather than zero when nothing printed one.

It is a glance view rather than a place to work. A floor plan cannot show you
terminal output. Click any desk to go back to the canvas with that agent
selected, or press `Esc`.

## Why this one knows things the others guess at

Comparable tools read a harness's transcript file and infer from it.
[Pixel Agents](https://www.mdskills.ai/skills/pixel-agents) says outright that
the format gives no clear signal for when an agent is waiting on input, so it
falls back to idle timers that misfire.

This canvas does not have that problem. It owns the pty, so idle, running and
waiting are read rather than guessed, and it owns the Bus, so it knows who
messaged whom and who claimed what. A trip across this room always means
something happened.

## What was borrowed, and what was left out

[Ctrl/Cubicles](https://marketplace.visualstudio.com/items?itemName=bulletproof-sh.ctrl)
floats activity indicators over its characters and pairs the office with a
session inspector. Both are here, with the indicator counting real unread
messages and the inspector staying inside the room instead of opening a separate
panel. [Pixel Agents](https://www.mdskills.ai/skills/pixel-agents) walks agents
to a desk and sits them down, which is where the sitting and standing
distinction comes from.
[agents-in-the-office](https://github.com/gukosowa/agents-in-the-office) sends
its characters to a specific object for a specific tool, which is the board and
the shelf here.

Two things were deliberately left out. There is no idle wandering, because
movement here is meant to be evidence that something happened. And there is no
RPG Maker tileset: those assets are licensed to whoever bought the editor.

## The art

The characters are
[MetroCity](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) (CC0)
and the furniture comes from
[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) (MIT), the same
places the other office sims get theirs. [CREDITS.md](../CREDITS.md) has the
terms in full and [`scripts/vendor-assets.mjs`](../scripts/vendor-assets.mjs) is
what fetches them.

The canvas is scaled by a whole number and never smoothed, so a drawn pixel is
always a square block of screen pixels.
