#!/usr/bin/env node
/**
 * Vendor the office sprites.
 *
 * The pixel office draws third-party art. Rather than committing it with no
 * record of where it came from, this script is the record: it names the
 * source, the licence, and exactly which files are taken, and it can be re-run
 * to refresh them.
 *
 *   node scripts/vendor-assets.mjs <path-to-pixel-agents-checkout>
 *
 * Licences, both checked before anything was copied:
 *
 *   Characters  CC0 1.0 (public domain). "MetroCity Free Top-Down Character
 *               Pack" by jik-a-4. https://jik-a-4.itch.io/metrocity-free-topdown-character-pack
 *               The author confirms commercial use; credit is appreciated and
 *               not required. We credit anyway, in CREDITS.md.
 *
 *   Everything   MIT, Copyright (c) 2026 Pablo De Lucca, from
 *   else         https://github.com/pixel-agents-hq/pixel-agents
 *               MIT requires the copyright notice to travel with the files.
 *               CREDITS.md carries it.
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/vendor-assets.mjs <path-to-pixel-agents-checkout>");
  process.exit(2);
}

const from = resolve(source, "webview-ui/public/assets");
if (!existsSync(from)) {
  console.error(`no assets at ${from}`);
  console.error("expected a checkout of https://github.com/pixel-agents-hq/pixel-agents");
  process.exit(2);
}

const here = dirname(new URL(import.meta.url).pathname);
const to = resolve(here, "..", "src/office/pixels/assets");

/** Exactly what we use. Taking the whole tree would bloat the bundle with
 *  furniture the office never places. */
const WANTED = {
  characters: ["char_0.png", "char_1.png", "char_2.png", "char_3.png", "char_4.png", "char_5.png"],
  floors: [
    "floor_0.png", "floor_1.png", "floor_2.png", "floor_3.png", "floor_4.png",
    "floor_5.png", "floor_6.png", "floor_7.png", "floor_8.png",
  ],
  carpets: ["carpet_0.png", "carpet_1.png", "carpet_2.png"],
};

/** Furniture is a directory each, with a manifest we do not need. */
const FURNITURE = [
  "DESK", "PC", "PLANT", "LARGE_PLANT", "CACTUS", "BOOKSHELF", "DOUBLE_BOOKSHELF",
  "SOFA", "WHITEBOARD", "BIN", "COFFEE", "CLOCK", "WOODEN_CHAIR", "SMALL_TABLE",
  "LARGE_PAINTING",
];

let copied = 0;

for (const [dir, files] of Object.entries(WANTED)) {
  mkdirSync(join(to, dir), { recursive: true });
  for (const f of files) {
    const src = join(from, dir, f);
    if (!existsSync(src)) {
      console.warn(`missing, skipped: ${dir}/${f}`);
      continue;
    }
    copyFileSync(src, join(to, dir, f));
    copied++;
  }
}

for (const item of FURNITURE) {
  const src = join(from, "furniture", item);
  if (!existsSync(src)) {
    console.warn(`missing, skipped: furniture/${item}`);
    continue;
  }
  const dst = join(to, "furniture", item);
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (!f.endsWith(".png")) continue;
    copyFileSync(join(src, f), join(dst, f));
    copied++;
  }
}

console.log(`vendored ${copied} files into src/office/pixels/assets`);
