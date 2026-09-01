import { describe, expect, it } from "vitest";
import { CHAR_H, CHAR_PER_ROW, CHAR_W, faceFor, frameAt, FRAMES } from "./atlas";

describe("frameAt", () => {
  it("reads the row for each facing", () => {
    expect(frameAt("down", 0)).toEqual({ sx: 0, sy: 0, flip: false });
    expect(frameAt("up", 0)).toEqual({ sx: 0, sy: CHAR_H, flip: false });
    expect(frameAt("right", 0)).toEqual({ sx: 0, sy: CHAR_H * 2, flip: false });
  });

  it("makes left out of right, mirrored", () => {
    // The pack has no left row. Flipping keeps the two from disagreeing.
    const right = frameAt("right", 2);
    const left = frameAt("left", 2);
    expect(left.sx).toBe(right.sx);
    expect(left.sy).toBe(right.sy);
    expect(left.flip).toBe(true);
    expect(right.flip).toBe(false);
  });

  it("steps along the row by frame", () => {
    expect(frameAt("down", 3).sx).toBe(3 * CHAR_W);
  });

  it("stays on the sheet however far the animation counts", () => {
    for (const n of [0, 6, 7, 21, 1000]) {
      const f = frameAt("down", n);
      expect(f.sx).toBeGreaterThanOrEqual(0);
      expect(f.sx).toBeLessThan(CHAR_PER_ROW * CHAR_W);
    }
  });
});

describe("FRAMES", () => {
  it("cycles the walk so it rocks rather than marches", () => {
    expect(FRAMES.walk).toEqual([0, 1, 2, 1]);
  });

  it("only names frames the sheet actually has", () => {
    const used = [...FRAMES.walk, FRAMES.idle, ...FRAMES.typing, ...FRAMES.reading];
    for (const f of used) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(CHAR_PER_ROW);
    }
  });
});

describe("faceFor", () => {
  it("gives the same agent the same face every time", () => {
    expect(faceFor("node-abc")).toBe(faceFor("node-abc"));
  });

  it("stays in range", () => {
    for (const id of ["a", "node-1", "", "a very long node identifier here"]) {
      const f = faceFor(id);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(6);
    }
  });

  it("does not depend on position in the list", () => {
    // Removing an agent must not re-cast everyone below it.
    const before = ["n1", "n2", "n3"].map((id) => faceFor(id));
    const after = ["n2", "n3"].map((id) => faceFor(id));
    expect(after).toEqual([before[1], before[2]]);
  });

  it("spreads across the available faces", () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) => faceFor(`node-${i}`))
    );
    expect(seen.size).toBeGreaterThan(3);
  });
});
