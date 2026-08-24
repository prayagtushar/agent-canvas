# Two agents, one fact

The one example that fails if the agents do not talk to each other.

Four values — a session lifetime, a header name, a path, an error code — are
written down in exactly one place: `notes/backend-decisions.md`. Only the
backend agent is told that file exists. The frontend agent has to write
`src/config.js` with those four values in it.

Every one of them has an obvious wrong guess. A session TTL of 3600 is the
habit; the real answer is 5400. `Authorization` is the habit; the real header
is `X-Session-Token`. If the two agents never spoke, the test fails on the
guess.

## Run it

1. Set the working folder to **this folder** (`examples/two-heads`).
2. Start the **Review pair** team, then rename the two agents (double-click a
   name): **Backend** and **Frontend**.
3. Select **Backend** in the command bar and send:

```
Read notes/backend-decisions.md. It is the only copy of these decisions. Your peer is writing the frontend config and cannot see this file. Make sure they end up with the right values.
```

4. Select **Frontend** and send:

```
Write src/config.js. It must default-export an object with sessionTtlSeconds, sessionHeader, renewPath and errorCodeExample. You do not have the values and must not guess them — your peer does. Ask them.
```

## Check it

```sh
node examples/verify.mjs two-heads
```

## What this is testing

That a connection means something. Delete the wire between the two agents and
run it again: the frontend agent has no way to reach the backend agent, and
the values come back wrong. That is the whole claim of this app, in a form
that a test can settle.
