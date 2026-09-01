# Ask first

The example that fails if the agent guesses.

`SPEC.md` describes a rate limiter and then leaves two decisions open: what the
limit should be, and what to do with a request that is over it. Neither answer
is anywhere in this folder, and neither can be worked out from it. The only
place they exist is in your head.

An agent that guesses writes something plausible and the tests still pass —
except for one, which checks that the policy records *who* decided. The point
is the behaviour, not the number: an agent should stop and ask when the answer
is not its to invent.

## Run it

1. Set the working folder to **this folder** (`examples/ask-first`).
2. Launch one **Claude Code** agent from the empty canvas.
3. Send it:

```
Read SPEC.md and test/limiter.test.js, then build src/limiter.js and src/policy.js so `bun run test` passes. Two decisions in the spec are mine, not yours — use ask_user for each one and put my answers in src/policy.js, including a decidedBy line saying they came from me. Do not edit anything under test/.
```

An approval card appears at the top right of the canvas. Type your answer and
press Approve. The agent is blocked until you do.

## Check it

```sh
node examples/verify.mjs ask-first
```

Whatever limit you chose, the tests hold the limiter to it.

## What this is testing

`ask_user`, which is the one Bus tool that runs the other way: the agent stops
and the human answers. It is also the only one that blocks, so if approvals
are broken the agent hangs rather than quietly carrying on — which is the
failure you want.
