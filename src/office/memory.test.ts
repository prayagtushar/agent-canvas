import { describe, expect, it } from "vitest";
import { justWrote } from "./memory";
import type { MemoryEntry } from "../types";

const note = (key: string, author: string, ts: number): MemoryEntry => ({
  key,
  value: "v",
  author,
  ts,
});

describe("justWrote", () => {
  it("finds the author of a new note", () => {
    expect(justWrote([], [note("api", "a1", 10)])).toEqual(["a1"]);
  });

  it("says nothing when the list is unchanged", () => {
    // The Bus re-sends the whole list on every change, so this is the common
    // case and it must not send anyone walking.
    const list = [note("api", "a1", 10), note("db", "a2", 11)];
    expect(justWrote(list, list)).toEqual([]);
  });

  it("counts an overwrite as a write", () => {
    const before = [note("api", "a1", 10)];
    const after = [note("api", "a2", 20)];
    expect(justWrote(before, after)).toEqual(["a2"]);
  });

  it("does not count a stale copy of a note already held", () => {
    const before = [note("api", "a1", 20)];
    const after = [note("api", "a1", 10)];
    expect(justWrote(before, after)).toEqual([]);
  });

  it("sends an agent on one trip however much it wrote at once", () => {
    const after = [note("a", "a1", 1), note("b", "a1", 2), note("c", "a2", 3)];
    expect(justWrote([], after)).toEqual(["a1", "a2"]);
  });

  it("ignores a note with no author", () => {
    expect(justWrote([], [note("api", "", 10)])).toEqual([]);
  });

  it("handles the operator's own notes like anyone else's", () => {
    // The operator writes as "operator", which is not a node, so no desk
    // matches and place() leaves it alone. Nothing here needs to know that.
    expect(justWrote([], [note("api", "operator", 10)])).toEqual(["operator"]);
  });
});
