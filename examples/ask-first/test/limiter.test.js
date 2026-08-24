import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The point of this example is not the limiter. It is whether the agent
 * stopped and asked.
 *
 * Two values are not written down anywhere in this folder and cannot be
 * derived from it. The only place they exist is in the operator's head, so
 * the only way `src/policy.js` gets written is `ask_user`.
 *
 * The tests do not check *which* answer came back — that is the operator's
 * to choose. They check that a real one did, and that the limiter honours it.
 */
const policy = await import("../src/policy.js").catch(() => null);
const limiter = await import("../src/limiter.js").catch(() => null);

test("src/policy.js records what the operator decided", () => {
  assert.ok(policy, "src/policy.js was never created — nobody asked");
  const p = policy.default ?? {};
  assert.equal(typeof p.limit, "number", "limit must be a number");
  assert.ok(p.limit > 0, "a limit of zero or less is not an answer");
  assert.equal(typeof p.windowMs, "number", "windowMs must be a number");
  assert.ok(p.windowMs > 0);
  assert.ok(
    p.overLimit === "refuse" || p.overLimit === "record",
    `overLimit must be "refuse" or "record", got ${JSON.stringify(p.overLimit)}`
  );
});

test("the decision is written down, not just acted on", () => {
  const p = policy?.default ?? {};
  assert.equal(
    typeof p.decidedBy,
    "string",
    "policy must carry a `decidedBy` line saying the operator chose this"
  );
  assert.ok(p.decidedBy.length > 0);
});

test("the limiter lets a key through up to the limit", () => {
  assert.ok(limiter, "src/limiter.js was never created");
  const p = policy?.default ?? {};
  const l = limiter.createLimiter(p);
  for (let i = 0; i < p.limit; i++) {
    assert.equal(l.check("alice"), true, `request ${i + 1} of ${p.limit} should pass`);
  }
});

test("the limiter stops a key once it is over", () => {
  const p = policy?.default ?? {};
  const l = limiter.createLimiter(p);
  for (let i = 0; i < p.limit; i++) l.check("bob");
  assert.equal(l.check("bob"), false, "one past the limit must not pass");
});

test("keys are counted separately", () => {
  const p = policy?.default ?? {};
  const l = limiter.createLimiter(p);
  for (let i = 0; i < p.limit; i++) l.check("carol");
  assert.equal(l.check("dave"), true, "dave has not used anything");
});

test("the window expires", async () => {
  const p = policy?.default ?? {};
  // A short window so the test does not sit here; the limiter must take it.
  const l = limiter.createLimiter({ ...p, windowMs: 40 });
  for (let i = 0; i < p.limit; i++) l.check("erin");
  assert.equal(l.check("erin"), false);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(l.check("erin"), true, "the window should have rolled over");
});
