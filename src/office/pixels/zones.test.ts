import { describe, expect, it } from "vitest";
import { desksPx, ROOM_PX } from "./scene";
import { catRange, COLS, inAnyZone, inZone, pixelsOfZone, ROWS, TILE, ZONES, zoneById } from "./zones";

describe("the room in tiles", () => {
  it("divides exactly, so no zone edge lands mid-tile", () => {
    expect(COLS).toBe(ROOM_PX.w / TILE);
    expect(ROWS).toBe(ROOM_PX.h / TILE);
    expect(Number.isInteger(COLS)).toBe(true);
    expect(Number.isInteger(ROWS)).toBe(true);
  });
});

describe("zones", () => {
  it("keeps every zone inside the walls", () => {
    for (const z of ZONES) {
      const r = pixelsOfZone(z);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(ROOM_PX.w);
      expect(r.y + r.h).toBeLessThanOrEqual(ROOM_PX.h);
    }
  });

  it("does not let two zones overlap", () => {
    for (let i = 0; i < ZONES.length; i++) {
      for (let j = i + 1; j < ZONES.length; j++) {
        const a = pixelsOfZone(ZONES[i]);
        const b = pixelsOfZone(ZONES[j]);
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps the desks out of the kitchen and the lounge", () => {
    // The layout centres the desks and knows nothing about zones, so this is
    // the check that the two arrangements do not collide. Well past the
    // default agent cap, because the cap is a setting and this must not
    // depend on it: the separation is on x, and desks wrap at four per row.
    for (let n = 1; n <= 24; n++) {
      for (const desk of desksPx(n)) {
        expect(inAnyZone(desk)).toBe(false);
      }
    }
  });

  it("can be looked up by name", () => {
    expect(zoneById("kitchen")?.id).toBe("kitchen");
    expect(zoneById("lounge")?.id).toBe("lounge");
  });

  it("knows what is inside it and what is not", () => {
    const lounge = zoneById("lounge")!;
    const r = pixelsOfZone(lounge);
    expect(inZone(lounge, { x: r.x + 1, y: r.y + 1 })).toBe(true);
    expect(inZone(lounge, { x: r.x - 1, y: r.y + 1 })).toBe(false);
    // Half open: the far edge belongs to the next tile along.
    expect(inZone(lounge, { x: r.x + r.w, y: r.y })).toBe(false);
  });
});

describe("catRange", () => {
  it("keeps the cat in the lounge, away from the desks", () => {
    const r = catRange();
    expect(r.x1).toBeGreaterThan(r.x0);
    expect(r.y1).toBeGreaterThan(r.y0);
    for (const corner of [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y1 },
    ]) {
      expect(corner.x).toBeGreaterThan(0);
      expect(corner.x).toBeLessThan(ROOM_PX.w);
      expect(corner.y).toBeGreaterThan(0);
      expect(corner.y).toBeLessThan(ROOM_PX.h);
    }
  });

  it("never sends the cat onto a desk", () => {
    const r = catRange();
    for (const desk of desksPx(8)) {
      const inside =
        desk.x >= r.x0 && desk.x <= r.x1 && desk.y >= r.y0 && desk.y <= r.y1;
      expect(inside).toBe(false);
    }
  });
});
