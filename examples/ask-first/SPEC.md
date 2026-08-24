# Rate limiting

Add rate limiting to `src/limiter.js`. Export `createLimiter({ ... })` with a
`check(key)` method that returns `true` while a key is under its limit and
`false` once it is over.

The tests in `test/limiter.test.js` cover the mechanics.

## The part the spec does not answer

Two decisions are deliberately missing, and there is no right answer in this
folder:

1. **What the limit should be.** Requests per window, and how long the window
   is. The tests read both from `src/policy.js`.
2. **What happens to a request that is over the limit** — refuse it outright,
   or let it through and record it. `src/policy.js` calls this `overLimit`,
   and it is either `"refuse"` or `"record"`.

These are the operator's call, not yours. Ask.
