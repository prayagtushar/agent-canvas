# Teams

A team is a set of agents, their roles, and the wires between them. Four ship
with the app:

| Team | Who |
| --- | --- |
| Review pair | A Maker writes, a Reviewer reads it and objects |
| Plan, build, verify | A Planner fills the board, a Builder claims from it, a Verifier runs the tests |
| Orchestrator | One lead that hires its own crew and splits the work between them |
| Second opinion | Two different CLIs answer the same question, then compare |

Each member gets an opening brief that sets its role and tells it to wait, so
launching a team spends nothing until you send the first instruction. A role is
stored on the Bus, which means peers read it out of `list_peers`. That is how an
agent knows to hand a review to the Reviewer rather than doing it itself.

Wire up a canvas you like, then **Save this canvas as a team** from the same
menu. Agent processes do not survive a restart. The team does.

## Letting an agent build its own team

An agent with the Bus can call `hire_agent`. The new agent starts in the same
folder, connected to the one that asked for it, with whatever opening brief it
was given. That is how the **Orchestrator** team works: you start one Claude
Code agent, tell it what to build, and it staffs the rest itself.

Guardrails, because this starts real processes and spends real money:

- Off is one click away, under Settings, **Start other agents**.
- Eight agents on the canvas at once, however they got there.
- A name already in use, a CLI that is not installed, and a nameless agent are
  all refused before anything is spawned.
- Every hired agent appears on your canvas with a toast saying who started it.

New agents get a call-sign of their own (Orion, Juno, Vega and so on), so two
Claude agents are never both called "claude". Double-click a name to change it.
Peers see the new one too.
