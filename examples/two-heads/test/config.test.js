import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The point of this example is not the code. It is whether one agent asked
 * the other.
 *
 * Every value below is written down in exactly one place —
 * notes/backend-decisions.md — and only the Backend agent is told to read it.
 * The Frontend agent writes src/config.js. If the two never spoke, the numbers
 * here are guesses, and guesses fail.
 */
const config = await import("../src/config.js").catch(() => null);

test("src/config.js exists and default-exports an object", () => {
  assert.ok(config, "src/config.js was never created");
  assert.equal(typeof config.default, "object", "it must be the default export");
});

const c = config?.default ?? {};

test("the session lifetime came from the backend, not from a habit", () => {
  assert.equal(
    c.sessionTtlSeconds,
    5400,
    "3600 and 7200 are the obvious guesses; the real answer is written down on the backend side"
  );
});

test("the token header is the one the backend actually reads", () => {
  assert.equal(c.sessionHeader, "X-Session-Token");
});

test("the renew path is the current one, not the retired one", () => {
  assert.equal(c.renewPath, "/session/renew");
});

test("the error shape matches what the backend sends", () => {
  assert.equal(c.errorCodeExample, "session.expired");
});
