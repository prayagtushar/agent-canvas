import { describe, expect, it } from "vitest";
import { desks } from "../layout";
import {
  corner,
  desksPx,
  ease,
  facing,
  lerp,
  mirrored,
  ROOM_PX,
  SCALE,
  toPixel,
} from "./scene";

describe("the pixel room", () => {
  it("is a whole number of tiles", () => {
    expect(ROOM_PX.w % 16).toBe(0);
    expect(ROOM_PX.h % 16).toBe(0);
  });

  it("puts every desk on a whole pixel", () => {
    // Half a pixel in pixel art is a blurred edge.
    for (const d of desksPx(8)) {
      expect(Number.isInteger(d.x)).toBe(true);
      expect(Number.isInteger(d.y)).toBe(true);
    }
  });

  it("keeps every desk inside the room", () => {
    for (let n = 1; n <= 8; n++) {
      for (const d of desksPx(n)) {
        expect(d.x).toBeGreaterThan(0);
        expect(d.x).toBeLessThan(ROOM_PX.w);
        expect(d.y).toBeGreaterThan(0);
        expect(d.y).toBeLessThan(ROOM_PX.h);
      }
    }
  });

  it("agrees with the shared layout about who sits where", () => {
    // Both views read the same arrangement; only the scale differs.
    expect(desksPx(5)).toEqual(desks(5).map(toPixel));
  });

  it("scales without reordering", () => {
    expect(desksPx(4)).toHaveLength(4);
  });

  it("scales and then rounds, rather than carrying a fraction into a pixel", () => {
    expect(toPixel({ x: 100, y: 200 })).toEqual({
      x: Math.round(100 * SCALE),
      y: Math.round(200 * SCALE),
    });
    // 100 * 0.625 is 62.5, and half a pixel is a blurred edge.
    expect(Number.isInteger(toPixel({ x: 100, y: 100 }).x)).toBe(true);
  });
});

describe("corner", () => {
  it("centres a sprite on a point", () => {
    expect(corner({ x: 100, y: 50 }, 10, 4)).toEqual({ x: 95, y: 48 });
  });

  it("lands on whole pixels for odd sizes too", () => {
    const c = corner({ x: 100, y: 50 }, 11, 5);
    expect(Number.isInteger(c.x)).toBe(true);
    expect(Number.isInteger(c.y)).toBe(true);
  });
});

describe("facing", () => {
  const from = { x: 100, y: 100 };

  it("faces sideways when crossing the room", () => {
    expect(facing(from, { x: 200, y: 100 })).toBe("side");
    expect(facing(from, { x: 0, y: 100 })).toBe("side");
  });

  it("faces up and down when the move is mostly vertical", () => {
    expect(facing(from, { x: 100, y: 0 })).toBe("up");
    expect(facing(from, { x: 100, y: 200 })).toBe("down");
  });

  it("prefers sideways on a diagonal", () => {
    // The side pose carries the most detail, and a character crossing the
    // room while drifting slightly up should not turn its back on you.
    expect(facing(from, { x: 180, y: 40 })).toBe("side");
  });

  it("is mirrored only when heading left", () => {
    expect(mirrored(from, { x: 200, y: 100 })).toBe(false);
    expect(mirrored(from, { x: 20, y: 100 })).toBe(true);
  });
});

describe("ease", () => {
  it("starts at nothing and ends at everything", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("clamps outside the walk", () => {
    expect(ease(-3)).toBe(0);
    expect(ease(9)).toBe(1);
  });

  it("is slowest at the ends", () => {
    const start = ease(0.05) - ease(0);
    const middle = ease(0.55) - ease(0.5);
    expect(middle).toBeGreaterThan(start);
  });
});

describe("lerp", () => {
  it("walks from one point to the other", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 50 };
    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.5)).toEqual({ x: 50, y: 25 });
  });
});
