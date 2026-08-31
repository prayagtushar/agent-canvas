import { describe, expect, it } from "vitest";
import { directionOf, recentFor } from "./peek";
import type { Activity } from "../types";

const line = (id: number, from: string, to: string): Activity => ({
  id,
  from,
  to,
  text: `m${id}`,
  ts: id,
});

const log: Activity[] = [
  line(1, "a1", "a2"),
  line(2, "a2", "a1"),
  line(3, "a3", "a2"),
  line(4, "a1", "a3"),
  line(5, "a3", "a1"),
  line(6, "a2", "a3"),
];

describe("recentFor", () => {
  it("takes both what an agent said and what was said to it", () => {
    // A wire is two-way. Showing only what a1 sent would hide the reply that
    // explains why it acted.
    expect(recentFor(log, "a1", 10).map((a) => a.id).sort()).toEqual([1, 2, 4, 5]);
  });

  it("puts the newest first", () => {
    expect(recentFor(log, "a1", 10).map((a) => a.id)).toEqual([5, 4, 2, 1]);
  });

  it("keeps only the last few, newest first", () => {
    expect(recentFor(log, "a1", 2).map((a) => a.id)).toEqual([5, 4]);
  });

  it("has nothing to show for an agent nobody has talked to", () => {
    expect(recentFor(log, "a9")).toEqual([]);
    expect(recentFor([], "a1")).toEqual([]);
  });
});

describe("directionOf", () => {
  it("reads the line from that agent's side", () => {
    expect(directionOf(line(1, "a1", "a2"), "a1")).toBe("sent");
    expect(directionOf(line(1, "a1", "a2"), "a2")).toBe("received");
  });
});
