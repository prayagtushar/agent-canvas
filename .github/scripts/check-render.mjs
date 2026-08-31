// Decide whether a screenshot of the Linux window shows a rendered app.
//
// Two ways it goes wrong, and they look nothing alike. If the window never
// maps, the shot is Xvfb's own root: one flat colour, no variation. If the
// backdrop regresses to transparency again, the app paints nothing and the
// page underneath shows through, which is light. So the test is that the
// picture varies, and that it is dark.
//
// Deliberately loose. This is here to catch a window that is blank or
// inverted, not to police a shade.

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: check-render.mjs <png>");
  process.exit(2);
}

// Only catches a truncated or zero-byte capture. A flat screen is a real
// screenshot and is judged below, not here.
if (statSync(file).size < 100) {
  console.error(`${file} is empty; the capture itself failed.`);
  process.exit(1);
}

// ImageMagick reports both on a 0..1 scale.
const [mean, deviation] = execFileSync(
  "identify",
  ["-format", "%[fx:mean] %[fx:standard_deviation]", file],
  { encoding: "utf8" }
)
  .trim()
  .split(/\s+/)
  .map(Number);

const size = execFileSync("identify", ["-format", "%wx%h", file], {
  encoding: "utf8",
}).trim();

console.log(`${size}  mean=${mean.toFixed(4)}  deviation=${deviation.toFixed(4)}`);

const problems = [];
if (!(deviation > 0.01)) {
  problems.push(
    "The screen is one flat colour, so the window never drew. /tmp/app.log has what it said."
  );
}
if (!(mean < 0.35)) {
  problems.push(
    "The screen is light. The app is dark throughout, so this is the backdrop " +
      "missing and the page behind it showing — the bug src/surface.ts exists to prevent."
  );
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL: ${p}`);
  console.error("Download the linux-window artifact to see it.");
  process.exit(1);
}

console.log("PASS: the window rendered, and it is dark.");
