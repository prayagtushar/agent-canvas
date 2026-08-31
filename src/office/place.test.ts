import { describe, expect, it } from "vitest";
import { BOARD, MANAGER } from "./layout";
import { place, type PlaceInput } from "./place";

const DESK = { x: 500, y: 400 };
const PEER_DESK = { x: 700, y: 400 };

const at = (over: Partial<PlaceInput> = {}) =>
  place({
    desk: DESK,
    blocked: false,
    errand: null,
    deskOf: (id) => (id === "peer" ? PEER_DESK : undefined),
    ...over,
  });

/** Roughly how far the placement is from a landmark. */
const near = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

describe("place", () => {
  it("seats an idle agent at its own desk", () => {
    const p = at();
    expect(p.point).toEqual(DESK);
    expect(p.away).toBe(false);
    expect(p.says).toBeNull();
  });

  it("sends a blocked agent to stand at your desk", () => {
    const p = at({ blocked: true });
    expect(near(p.point, MANAGER)).toBeLessThan(near(DESK, MANAGER));
    expect(p.away).toBe(true);
    expect(p.says).toBe("needs you");
  });

  it("keeps blocked above any errand in flight", () => {
    // An agent stopped and waiting on a person is the most useful thing this
    // view shows. A message going out must not bury it.
    const p = at({ blocked: true, errand: { kind: "peer", peer: "peer", text: "hi" } });
    expect(near(p.point, MANAGER)).toBeLessThan(near(p.point, PEER_DESK));
    expect(p.says).toBe("needs you");
  });

  it("walks a message over to the peer's desk", () => {
    const p = at({ errand: { kind: "peer", peer: "peer", text: "take this" } });
    expect(near(p.point, PEER_DESK)).toBeLessThan(near(DESK, PEER_DESK));
    expect(p.away).toBe(true);
    expect(p.says).toBe("take this");
  });

  it("stays put when the peer is not on the canvas", () => {
    // Agents can be removed mid-flight; walking to the origin is worse than
    // not walking.
    const p = at({ errand: { kind: "peer", peer: "gone", text: "hello" } });
    expect(p.point).toEqual(DESK);
    expect(p.away).toBe(false);
    expect(p.says).toBe("hello");
  });

  it("walks to the board for task work", () => {
    const p = at({ errand: { kind: "board", text: "claimed" } });
    expect(near(p.point, BOARD)).toBeLessThan(near(DESK, BOARD));
    expect(p.away).toBe(true);
  });

  it("never stands exactly on the landmark it visited", () => {
    for (const p of [at({ blocked: true }), at({ errand: { kind: "board", text: "x" } })]) {
      expect(near(p.point, MANAGER)).toBeGreaterThan(0);
      expect(near(p.point, BOARD)).toBeGreaterThan(0);
    }
  });
});
