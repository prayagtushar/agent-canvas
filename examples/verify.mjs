#!/usr/bin/env node
/**
 * Did the agents actually do it?
 *
 * Each example is a folder with a failing test suite. Run this before you
 * start and everything is red; run it after and the ones the agents finished
 * are green. Nothing here talks to the app, and nothing here can be satisfied
 * by an agent saying it is done.
 *
 *   node examples/verify.mjs           every example
 *   node examples/verify.mjs two-heads just that one
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const TITLES = {
  "fix-the-tests": "Fix the failing tests",
  "two-heads": "Two agents, one fact",
  "ask-first": "Ask before deciding",
  "build-the-api": "Build it from the spec",
};

const wanted = process.argv.slice(2);
const examples = readdirSync(here, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(here, e.name, "package.json")))
  .map((e) => e.name)
  .filter((name) => wanted.length === 0 || wanted.includes(name))
  .sort();

if (examples.length === 0) {
  console.error(
    wanted.length ? `No example called ${wanted.join(", ")}.` : "No examples found."
  );
  process.exit(2);
}

const results = [];
for (const name of examples) {
  const run = spawnSync("npm", ["test", "--silent"], {
    cwd: join(here, name),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const num = (key) => Number(out.match(new RegExp(`^. ${key} (\\d+)$`, "m"))?.[1] ?? 0);
  results.push({
    name,
    ok: run.status === 0,
    pass: num("pass"),
    fail: num("fail"),
    out,
  });
}

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const green = (s) => (colour ? `\u001b[32m${s}\u001b[0m` : s);
const red = (s) => (colour ? `\u001b[31m${s}\u001b[0m` : s);

const pad = Math.max(...results.map((r) => (TITLES[r.name] ?? r.name).length));
console.log("");
for (const r of results) {
  const title = (TITLES[r.name] ?? r.name).padEnd(pad);
  const mark = r.ok ? green("PASS") : red("FAIL");
  const tally = r.ok ? `${r.pass} tests` : `${r.fail} of ${r.pass + r.fail} still failing`;
  console.log(`  ${mark}  ${title}  ${tally}`);
}

const failed = results.filter((r) => !r.ok);
console.log("");
if (failed.length === 0) {
  console.log("  Every example passes. The agents did the work.\n");
  process.exit(0);
}

// Only the first failure's output, or a fresh checkout prints three screens of
// red before anyone has done anything.
console.log(`  ${failed.length} of ${results.length} not done yet.`);
console.log(`  What ${TITLES[failed[0].name] ?? failed[0].name} is still failing on:\n`);
console.log(
  failed[0].out
    .split("\n")
    .filter((l) => /^(not ok|✖|\s+AssertionError|\s+Cannot find|Error)/.test(l))
    .slice(0, 12)
    .map((l) => `    ${l.trim()}`)
    .join("\n") || "    (run `npm test` in that folder for the details)"
);
console.log("");
process.exit(1);
