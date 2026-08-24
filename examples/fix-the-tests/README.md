# Fix the failing tests

A shopping cart with four bugs and a suite that catches all of them.

Nine tests, five failing. Nothing to install: it runs on Node's own test
runner.

## Run it

1. In Agent Canvas, set the working folder to **this folder**
   (`examples/fix-the-tests`).
2. Start the **Review pair** team from the empty canvas.
3. Pick **Everyone** in the command bar and send:

```
Run `npm test`. Four behaviours in src/cart.js are wrong and the suite says exactly what each should do. Fix them and get all nine tests passing. Do not change anything under test/.
```

## Check it

```sh
node examples/verify.mjs fix-the-tests
```

Green means the agents did it. Nothing an agent says counts here; only the
suite does.

## What this is testing

The plainest case: can a team read a failing suite, work out what the code was
supposed to do, and fix it without breaking the tests that already pass. The
Reviewer's job is to catch a "fix" that edits the test instead of the bug.
