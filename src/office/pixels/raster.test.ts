import { describe, expect, it } from "vitest";
import { heightOf, pixelsOf, recolour, widthOf } from "./raster";

const PALETTE = { a: "#aaa", b: "#bbb" };

describe("measuring a sprite", () => {
  it("takes width from the widest row", () => {
    expect(widthOf(["a", "aaa", "aa"])).toBe(3);
    expect(heightOf(["a", "aaa", "aa"])).toBe(3);
  });

  it("measures an empty sprite as nothing", () => {
    expect(widthOf([])).toBe(0);
    expect(heightOf([])).toBe(0);
  });
});

describe("pixelsOf", () => {
  it("places each pixel at its position in the string", () => {
    expect(pixelsOf([".a", "b."], PALETTE)).toEqual([
      { x: 1, y: 0, colour: "#aaa" },
      { x: 0, y: 1, colour: "#bbb" },
    ]);
  });

  it("treats dots and spaces as holes", () => {
    expect(pixelsOf(["...", "   "], PALETTE)).toEqual([]);
  });

  it("skips a key the palette has no colour for", () => {
    // A partial palette should give a partial sprite, not a black silhouette.
    expect(pixelsOf(["az"], PALETTE)).toEqual([{ x: 0, y: 0, colour: "#aaa" }]);
  });

  it("mirrors around the sprite's full width, not the row's", () => {
    // Rows can be ragged. Flipping row by row would shear the sprite.
    const flipped = pixelsOf(["a...", "b"], PALETTE, true);
    expect(flipped).toEqual([
      { x: 3, y: 0, colour: "#aaa" },
      { x: 3, y: 1, colour: "#bbb" },
    ]);
  });

  it("is its own inverse", () => {
    const art = ["ab.", ".ba"];
    const once = pixelsOf(art, PALETTE, true);
    const w = widthOf(art);
    const back = once.map((p) => ({ ...p, x: w - 1 - p.x }));
    expect(back).toEqual(pixelsOf(art, PALETTE));
  });
});

describe("recolour", () => {
  it("replaces only the keys named", () => {
    expect(recolour(PALETTE, { a: "#111" })).toEqual({ a: "#111", b: "#bbb" });
  });

  it("leaves the original alone", () => {
    const before = { ...PALETTE };
    recolour(PALETTE, { a: "#111" });
    expect(PALETTE).toEqual(before);
  });
});
