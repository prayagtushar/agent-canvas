import { describe, expect, it } from "vitest";
import { buildReport, reportFilename, type ReportInput } from "./report";
import type { CanvasNode } from "./types";

function agent(id: string, label: string, role = ""): CanvasNode {
  return {
    id,
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      nodeId: id,
      label,
      harness: "claude",
      cwd: "/work",
      status: "idle",
      role,
    },
  } as CanvasNode;
}

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    workspaceRoot: "/Users/x/work/checkout",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_000_000 + 25 * 60_000,
    nodes: [agent("a", "Maker", "Writes the code"), agent("b", "Reviewer", "Objects")],
    edges: [{ source: "a", target: "b" }],
    statuses: { a: "idle", b: "exited" },
    activity: [
      { id: 1, from: "a", to: "b", text: "auth.ts is ready to read", ts: 1_700_000_060_000 },
    ],
    tasks: [
      {
        id: "t1",
        title: "Move the token check",
        details: "out of the route handler",
        status: "done",
        owner: "b",
        result: "moved to middleware",
      },
    ],
    memory: [
      { key: "auth.shape", value: "one middleware, no per-route checks", author: "a", ts: 1 },
    ],
    transcripts: { a: "› ready\n› done", b: ">_ reviewing" },
    ...over,
  };
}

describe("the session report", () => {
  it("opens with what happened, in numbers", () => {
    const md = buildReport(input());
    expect(md).toContain("# Agent Canvas session — checkout");
    expect(md).toContain(
      "2 agents, 1 connection, 1 message between them, 1 of 1 task finished."
    );
    expect(md).toContain("(25 minutes)");
  });

  it("names agents everywhere, never their ids", () => {
    const md = buildReport(input());
    expect(md).toContain("| Maker | claude | Writes the code |");
    expect(md).toContain("- Maker ↔ Reviewer");
    expect(md).toContain("**Maker → Reviewer**");
    expect(md).toContain("*(Maker)*");
    expect(md).not.toMatch(/\ba ↔ b\b/);
  });

  it("says plainly when nothing happened, rather than leaving a blank", () => {
    const md = buildReport(
      input({ edges: [], activity: [], tasks: [], memory: [], transcripts: {} })
    );
    expect(md).toContain("Every agent worked alone");
    expect(md).toContain("Nothing crossed a wire.");
    expect(md).toContain("The shared board was never used.");
    expect(md).toContain("Nothing was written to shared memory.");
    expect(md).toContain("Nothing on screen.");
  });

  it("reports where an agent actually worked when it had a worktree", () => {
    const nodes = [agent("a", "Maker")];
    (nodes[0] as { data: { worktree?: string } }).data.worktree = "/work/.worktrees/maker-1";
    const md = buildReport(input({ nodes, edges: [], transcripts: {} }));
    expect(md).toContain("`/work/.worktrees/maker-1`");
  });

  it("leaves a stand-in out: it never ran", () => {
    const pending = agent("p", "Starting");
    (pending as { data: { pending?: boolean } }).data.pending = true;
    const md = buildReport(input({ nodes: [agent("a", "Maker"), pending], edges: [] }));
    expect(md).toContain("Maker");
    expect(md).not.toContain("Starting");
  });

  it("fences a transcript that contains a fence of its own", () => {
    const md = buildReport(
      input({
        nodes: [agent("a", "Maker")],
        edges: [],
        transcripts: { a: "here is code:\n```ts\nconst x = 1\n```" },
      })
    );
    // The inner fence must not end the block early.
    expect(md).toContain("````");
    const after = md.slice(md.indexOf("### Maker"));
    expect(after).toContain("const x = 1");
  });
});

describe("the report's filename", () => {
  it("sorts by date and says which folder it came from", () => {
    const name = reportFilename("/Users/x/work/checkout", new Date(2026, 7, 23, 9, 5).getTime());
    expect(name).toBe("checkout-20260823-0905.md");
  });

  it("does not put a folder name into the path", () => {
    const name = reportFilename("/tmp/../etc", Date.now());
    expect(name.startsWith("etc-")).toBe(true);
    expect(name).not.toContain("/");
  });
});
