import { describe, expect, it } from "vitest";
import { desks, MANAGER, ROOM, rows, standingAt, walkMs } from "./layout";

describe("rows", () => {
  it("puts everyone in one row until there are more than four", () => {
    expect(rows(1)).toEqual([1]);
    expect(rows(3)).toEqual([3]);
    expect(rows(4)).toEqual([4]);
  });

  it("balances the rows rather than stranding one desk", () => {
    // Five as 4+1 leaves a desk on its own at one end.
    expect(rows(5)).toEqual([3, 2]);
    expect(rows(6)).toEqual([3, 3]);
    expect(rows(8)).toEqual([4, 4]);
  });

  it("holds the agent cap and beyond", () => {
    for (let n = 1; n <= 16; n++) {
      expect(rows(n).reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it("has nothing to arrange for an empty office", () => {
    expect(rows(0)).toEqual([]);
    expect(desks(0)).toEqual([]);
  });
});

describe("desks", () => {
  it("gives every agent exactly one", () => {
    expect(desks(7)).toHaveLength(7);
  });

  it("centres each row on the room", () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const plan = rows(n);
      const all = desks(n);
      let at = 0;
      for (const inRow of plan) {
        const row = all.slice(at, at + inRow);
        at += inRow;
        const mid = (row[0].x + row[row.length - 1].x) / 2;
        expect(mid).toBeCloseTo(ROOM.w / 2, 6);
      }
    }
  });

  it("keeps every desk inside the room", () => {
    for (let n = 1; n <= 12; n++) {
      for (const d of desks(n)) {
        expect(d.x).toBeGreaterThan(0);
        expect(d.x).toBeLessThan(ROOM.w);
        expect(d.y).toBeGreaterThan(MANAGER.y);
        expect(d.y).toBeLessThan(ROOM.h);
      }
    }
  });

  it("puts the front row nearest you", () => {
    const all = desks(8);
    expect(all[0].y).toBeLessThan(all[7].y);
  });
});

describe("standingAt", () => {
  it("stops short of the target, on the approach side", () => {
    const spot = standingAt({ x: 500, y: 100 }, { x: 500, y: 400 });
    expect(spot.x).toBeCloseTo(500, 6);
    expect(spot.y).toBeCloseTo(158, 6);
  });

  it("never lands exactly on the thing it is visiting", () => {
    const target = { x: 300, y: 300 };
    for (const from of [
      { x: 0, y: 0 },
      { x: 900, y: 600 },
      { x: 300, y: 10 },
    ]) {
      const spot = standingAt(target, from);
      expect(Math.hypot(spot.x - target.x, spot.y - target.y)).toBeCloseTo(58, 6);
    }
  });

  it("does not divide by zero when it is already there", () => {
    const spot = standingAt({ x: 100, y: 100 }, { x: 100, y: 100 });
    expect(Number.isFinite(spot.x)).toBe(true);
    expect(Number.isFinite(spot.y)).toBe(true);
  });
});

describe("walkMs", () => {
  it("takes longer across the room than to the next desk", () => {
    const near = walkMs({ x: 0, y: 0 }, { x: 120, y: 0 });
    const far = walkMs({ x: 0, y: 0 }, { x: 900, y: 500 });
    expect(far).toBeGreaterThan(near);
  });

  it("is never instant and never tedious", () => {
    expect(walkMs({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeGreaterThanOrEqual(420);
    expect(walkMs({ x: 0, y: 0 }, { x: 9999, y: 9999 })).toBeLessThanOrEqual(1500);
  });
});
