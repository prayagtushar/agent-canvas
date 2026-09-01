import { describe, expect, it } from "vitest";
const STATIONS = {
  manager: { x: 500, y: 78 },
  board: { x: 92, y: 292 },
  shelf: { x: 908, y: 292 },
  door: { x: 92, y: 566 },
};
const MANAGER = STATIONS.manager;
const BOARD = STATIONS.board;
const SHELF = STATIONS.shelf;
const DOOR = STATIONS.door;
import { place, type PlaceInput } from "./place";

const DESK = { x: 500, y: 400 };
const PEER_DESK = { x: 700, y: 400 };

const at = (over: Partial<PlaceInput> = {}) =>
  place({
    desk: DESK,
    blocked: false,
    errand: null,
    deskOf: (id) => (id === "peer" ? PEER_DESK : undefined),
    stations: STATIONS,
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

describe("arriving", () => {
  it("stands a newly hired agent in the doorway", () => {
    const p = at({ errand: { kind: "arrive" } });
    expect(p.point).toEqual(DOOR);
    expect(p.away).toBe(true);
    expect(p.says).toBe("just hired");
  });

  it("is still outranked by being blocked on you", () => {
    const p = at({ blocked: true, errand: { kind: "arrive" } });
    expect(p.says).toBe("needs you");
  });
});

describe("the shelf", () => {
  it("walks a memory write over to the shelf", () => {
    const p = at({ errand: { kind: "shelf", text: "wrote it down" } });
    expect(near(p.point, SHELF)).toBeLessThan(near(DESK, SHELF));
    expect(p.away).toBe(true);
    expect(p.says).toBe("wrote it down");
  });

  it("still yields to being blocked on you", () => {
    const p = at({ blocked: true, errand: { kind: "shelf", text: "wrote it down" } });
    expect(p.says).toBe("needs you");
  });
});

describe("working in whatever units it is handed", () => {
  // The room exists at two scales: the arrangement is worked out in the
  // layout's units and drawn in a much smaller pixel grid. Reading the
  // landmarks from one while being handed desks from the other walked a
  // blocked agent through the far wall.
  const SMALL = {
    manager: { x: 200, y: 31 },
    board: { x: 37, y: 117 },
    shelf: { x: 363, y: 117 },
    door: { x: 37, y: 226 },
  };
  const smallDesk = { x: 200, y: 160 };

  const inSmall = (over: Partial<PlaceInput> = {}) =>
    place({
      desk: smallDesk,
      blocked: false,
      errand: null,
      deskOf: () => undefined,
      stations: SMALL,
      ...over,
    });

  it("keeps a blocked agent inside a small room", () => {
    const p = inSmall({ blocked: true });
    expect(p.point.x).toBeGreaterThan(0);
    expect(p.point.x).toBeLessThan(400);
    expect(p.point.y).toBeGreaterThan(0);
    expect(p.point.y).toBeLessThan(256);
  });

  it("still walks toward your desk, not past it", () => {
    const p = inSmall({ blocked: true });
    const toManager = Math.hypot(p.point.x - SMALL.manager.x, p.point.y - SMALL.manager.y);
    const deskToManager = Math.hypot(
      smallDesk.x - SMALL.manager.x,
      smallDesk.y - SMALL.manager.y
    );
    expect(toManager).toBeLessThan(deskToManager);
    expect(toManager).toBeGreaterThan(0);
  });

  it("puts an arriving agent exactly in that room's doorway", () => {
    expect(inSmall({ errand: { kind: "arrive" } }).point).toEqual(SMALL.door);
  });
});
