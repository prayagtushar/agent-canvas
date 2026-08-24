import { beforeEach, describe, expect, it } from "vitest";
import { BUILT_IN, deleteTeam, loadSaved, saveTeam } from "./teams";
import type { Team } from "./types";

function team(id: string, label: string): Team {
  return {
    id,
    label,
    blurb: "2 agents, 1 connection",
    saved: true,
    members: [
      { harness: "claude", name: "Maker", role: "Writes", brief: "you write" },
      { harness: "codex", name: "Reviewer", role: "Objects", brief: "you review" },
    ],
    wires: [[0, 1]],
  };
}

beforeEach(() => localStorage.clear());

describe("the teams that ship with the app", () => {
  it("wires every member to at least one other, unless it works alone", () => {
    for (const t of BUILT_IN) {
      // A team of one has nobody to be wired to; it hires its own peers.
      if (t.members.length < 2) continue;
      const joined = new Set(t.wires.flat());
      for (let i = 0; i < t.members.length; i++) {
        expect(joined.has(i), `${t.label}: ${t.members[i].name} is connected to nobody`).toBe(true);
      }
    }
  });

  it("gives a team that works alone the tool it needs to build one", () => {
    for (const t of BUILT_IN.filter((x) => x.members.length === 1)) {
      expect(t.members[0].brief, `${t.label} cannot get any help`).toContain("hire_agent");
    }
  });

  it("never points a wire at a member that does not exist", () => {
    for (const t of BUILT_IN) {
      for (const [a, b] of t.wires) {
        expect(a).toBeLessThan(t.members.length);
        expect(b).toBeLessThan(t.members.length);
        expect(a).not.toBe(b);
      }
    }
  });

  it("gives every member a role and a brief that tells it to wait", () => {
    for (const t of BUILT_IN) {
      for (const m of t.members) {
        expect(m.role, `${t.label}: ${m.name} has no role`).not.toBe("");
        // Launching a team must not spend credits before the operator says go.
        expect(m.brief.toLowerCase(), `${t.label}: ${m.name} starts working`).toContain("wait");
      }
    }
  });
});

describe("teams the operator saved", () => {
  it("comes back the way it went in", () => {
    saveTeam(team("t1", "My pair"));
    const [back] = loadSaved();
    expect(back).toEqual(team("t1", "My pair"));
  });

  it("keeps the newest first and replaces one saved under the same id", () => {
    saveTeam(team("t1", "First"));
    saveTeam(team("t2", "Second"));
    saveTeam(team("t1", "First, renamed"));

    expect(loadSaved().map((t) => t.label)).toEqual(["First, renamed", "Second"]);
  });

  it("forgets one without touching the others", () => {
    saveTeam(team("t1", "First"));
    saveTeam(team("t2", "Second"));

    expect(deleteTeam("t1").map((t) => t.id)).toEqual(["t2"]);
    expect(loadSaved().map((t) => t.id)).toEqual(["t2"]);
  });

  it("ignores anything on disk that is not a team", () => {
    localStorage.setItem(
      "ac.teams",
      JSON.stringify([
        team("good", "Fine"),
        { id: "no-members", label: "Broken", members: [], wires: [] },
        { id: "bad-wires", label: "Broken", members: [{ harness: "claude", name: "A" }], wires: [[0]] },
        "not even an object",
        null,
      ])
    );
    expect(loadSaved().map((t) => t.id)).toEqual(["good"]);
  });

  it("survives a corrupt store rather than blocking startup", () => {
    localStorage.setItem("ac.teams", "{not json");
    expect(loadSaved()).toEqual([]);
  });
});
