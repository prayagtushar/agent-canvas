import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  hasBackend: () => true,
  noAgentsReason: () => "No agent CLIs found on your PATH.",
  api: {
    addAgent: vi.fn(),
    createWorktree: vi.fn(),
    killAgent: vi.fn().mockResolvedValue(undefined),
    agentInput: vi.fn().mockResolvedValue(undefined),
    agentResize: vi.fn().mockResolvedValue(undefined),
    saveWorkspace: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue([]),
    loadWorkspace: vi.fn().mockResolvedValue(null),
    addEdge: vi.fn().mockResolvedValue(undefined),
    sendPrompt: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./notify", () => ({
  away: vi.fn(() => true),
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./terminals", () => ({
  dispose: vi.fn(),
  clearAll: vi.fn(),
  write: vi.fn(),
  syncTheme: vi.fn(),
  textOf: vi.fn(() => ""),
  contains: vi.fn(() => false),
}));

import { api } from "./api";
import * as notify from "./notify";
import * as terminals from "./terminals";
import { ERRAND_MS, matchesSearch, NODE_SIZE, updateNodeData, useStore } from "./store";
import type { NodeInfo, Task, Team } from "./types";

const initial = useStore.getState();

function reset() {
  useStore.setState(
    {
      nodes: [],
      edges: [],
      statuses: {},
      unread: {},
      toasts: [],
      selectedNodeId: null,
      workspaceRoot: "/work",
      useWorktrees: false,
      flow: null,
    },
    false
  );
}

function info(id: string, label = id): NodeInfo {
  return {
    id,
    label,
    harness: "claude",
    cwd: "/work",
    status: "idle",
    output_tail: [],
    unread: 0,
  };
}

beforeEach(() => {
  useStore.setState(initial, true);
  reset();
  // `restoreMocks` wipes what the factory above set up, so anything the store
  // calls and then `.catch`es has to hand back a promise again here. Setting
  // it per test rather than once also means no test inherits another's stub.
  vi.mocked(api.killAgent).mockResolvedValue(undefined);
  vi.mocked(api.sendPrompt).mockResolvedValue(undefined);
  vi.mocked(api.agentInput).mockResolvedValue(undefined);
  vi.mocked(api.agentResize).mockResolvedValue(undefined);
  vi.mocked(api.saveWorkspace).mockResolvedValue(undefined);
  vi.mocked(api.listTasks).mockResolvedValue([]);
  vi.mocked(api.loadWorkspace).mockResolvedValue(null);
  vi.mocked(api.addEdge).mockResolvedValue(undefined);
  vi.mocked(notify.away).mockReturnValue(true);
  vi.mocked(notify.notify).mockResolvedValue(undefined);
});

describe("where agent windows land", () => {
  it("never overlaps two windows", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));
    st.addAgentCanvasNode(info("c"));

    const boxes = useStore.getState().nodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: Number(n.style?.width),
      h: Number(n.style?.height),
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `windows ${i} and ${j} overlap`).toBe(true);
      }
    }
  });

  it("sizes a window for the terminal inside it", () => {
    useStore.getState().addAgentCanvasNode(info("a"));
    expect(useStore.getState().nodes[0].style).toMatchObject({
      width: NODE_SIZE.width,
      height: NODE_SIZE.height,
    });
  });
});

describe("launching an agent", () => {
  it("puts a stand-in on the canvas before the slow work starts", async () => {
    let resolve: (v: NodeInfo) => void = () => {};
    vi.mocked(api.addAgent).mockReturnValue(
      new Promise<NodeInfo>((r) => {
        resolve = r;
      })
    );

    const launching = useStore.getState().launchAgent("claude", "Orion");
    // Still in flight: the operator should already see something.
    const holder = useStore.getState().nodes[0];
    expect(holder.type).toBe("agent");
    expect(holder.type === "agent" && holder.data.pending).toBe(true);
    expect(holder.type === "agent" && holder.data.label).toBe("Orion");

    resolve(info("agent-1", "Orion"));
    await launching;

    const nodes = useStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("agent-1");
    expect(nodes[0].type === "agent" && nodes[0].data.pending).toBeFalsy();
  });

  it("takes the stand-in away again when the agent does not start", async () => {
    vi.mocked(api.addAgent).mockRejectedValue(new Error("claude CLI not found on PATH"));

    const id = await useStore.getState().launchAgent("claude");
    expect(id).toBeNull();
    expect(useStore.getState().nodes).toHaveLength(0);
    expect(useStore.getState().toasts[0].text).toContain("not found on PATH");
  });

  it("takes the stand-in away when the worktree cannot be made", async () => {
    useStore.setState({ useWorktrees: true });
    vi.mocked(api.createWorktree).mockRejectedValue(new Error("not a git repository"));

    expect(await useStore.getState().launchAgent("claude")).toBeNull();
    expect(useStore.getState().nodes).toHaveLength(0);
    expect(api.addAgent).not.toHaveBeenCalled();
  });

  it("refuses to launch before a working folder is chosen", async () => {
    useStore.setState({ workspaceRoot: "" });
    expect(await useStore.getState().launchAgent("claude")).toBeNull();
    expect(useStore.getState().nodes).toHaveLength(0);
    expect(useStore.getState().toasts[0].text).toContain("working folder");
  });
});

describe("the canvas follows the Bus", () => {
  it("redraws the wires the Bus reports and nothing else", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));
    st.edgesChanged([["a", "b"]]);

    const edges = useStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ id: "bus-a-b", source: "a", target: "b", type: "wire" });

    // A disconnect on the Bus is an empty list, not a request to keep drawing.
    useStore.getState().edgesChanged([]);
    expect(useStore.getState().edges).toHaveLength(0);
  });

  it("beads a wire in the direction the message travelled", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));
    st.edgesChanged([["a", "b"]]);

    st.pulseWire("a", "b");
    expect(useStore.getState().pulses["bus-a-b"]).toMatchObject({ seq: 1, reverse: false });

    // The wire is drawn a→b, so a reply has to run backwards along it.
    st.pulseWire("b", "a");
    expect(useStore.getState().pulses["bus-a-b"]).toMatchObject({ seq: 2, reverse: true });
  });

  it("ignores a message on a wire that is not drawn", () => {
    useStore.getState().pulseWire("a", "b");
    expect(useStore.getState().pulses).toEqual({});
  });
});

describe("removing a node", () => {
  it("stops the agent, drops its wires, and lets its terminal go", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));
    st.edgesChanged([["a", "b"]]);
    st.setSelected("a");

    useStore.getState().removeNode("a");

    expect(api.killAgent).toHaveBeenCalledWith("a");
    expect(terminals.dispose).toHaveBeenCalledWith("a");
    expect(useStore.getState().nodes.map((n) => n.id)).toEqual(["b"]);
    expect(useStore.getState().edges).toHaveLength(0);
    expect(useStore.getState().selectedNodeId).toBeNull();
  });

  it("does not call the backend about a stand-in that has no agent behind it", async () => {
    vi.mocked(api.addAgent).mockReturnValue(new Promise<NodeInfo>(() => {}));
    void useStore.getState().launchAgent("claude");
    const holder = useStore.getState().nodes[0].id;

    useStore.getState().removeNode(holder);
    expect(api.killAgent).not.toHaveBeenCalled();
    expect(terminals.dispose).not.toHaveBeenCalled();
  });
});

describe("unread counts", () => {
  it("counts messages to an agent the operator is not looking at", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.bumpUnread("a");
    st.bumpUnread("a");
    expect(useStore.getState().unread.a).toBe(2);
  });

  it("does not count a message to the agent already on screen", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setSelected("a");
    useStore.getState().bumpUnread("a");
    expect(useStore.getState().unread.a ?? 0).toBe(0);
  });
});

describe("what the command bar is aimed at", () => {
  it("leaves Everyone mode as soon as a window is picked", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setBroadcast(true);
    expect(useStore.getState().broadcast).toBe(true);

    useStore.getState().setSelected("a");
    expect(useStore.getState().broadcast).toBe(false);
    expect(useStore.getState().selectedNodeId).toBe("a");
  });

  it("reaches a busy agent too, because the pty queues the prompt", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));
    st.setStatus("b", "running");

    expect(useStore.getState().promptAll("go")).toBe(2);
    expect(api.sendPrompt).toHaveBeenCalledWith("b", "go");
  });

  it("does not send to a stand-in that has no process behind it", async () => {
    vi.mocked(api.addAgent).mockReturnValue(new Promise<NodeInfo>(() => {}));
    void useStore.getState().launchAgent("claude");

    expect(useStore.getState().promptAll("go")).toBe(0);
    expect(api.sendPrompt).not.toHaveBeenCalled();
  });
});

describe("recalling a prompt", () => {
  it("keeps the newest first and does not repeat one", () => {
    const st = useStore.getState();
    st.pushHistory("run the tests");
    st.pushHistory("check the diff");
    st.pushHistory("run the tests");
    expect(useStore.getState().history).toEqual(["run the tests", "check the diff"]);
  });

  it("survives a store that refuses to write", () => {
    const setItem = vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    useStore.getState().pushHistory("still remembered this session");
    expect(setItem).toHaveBeenCalled();
    expect(useStore.getState().history[0]).toBe("still remembered this session");
    setItem.mockRestore();
  });
});

describe("the traffic log", () => {
  it("keeps what crossed a wire and counts what has not been read", () => {
    const st = useStore.getState();
    st.logMessage("a", "b", "the spell is called OpenClaude");
    st.logMessage("b", "a", "noted");
    expect(useStore.getState().activity.map((m) => m.text)).toEqual([
      "the spell is called OpenClaude",
      "noted",
    ]);
    expect(useStore.getState().activity.length - useStore.getState().activitySeen).toBe(2);

    useStore.getState().setActivityOpen(true);
    expect(useStore.getState().activity.length - useStore.getState().activitySeen).toBe(0);
  });

  it("counts a message that lands while the panel is open as already read", () => {
    const st = useStore.getState();
    st.setActivityOpen(true);
    st.logMessage("a", "b", "seen as it arrives");
    expect(useStore.getState().activity.length - useStore.getState().activitySeen).toBe(0);
  });

  it("drops the oldest rather than growing without a bound", () => {
    const st = useStore.getState();
    for (let i = 0; i < 260; i++) st.logMessage("a", "b", `msg ${i}`);
    const kept = useStore.getState().activity;
    expect(kept).toHaveLength(200);
    expect(kept[0].text).toBe("msg 60");
    expect(kept[kept.length - 1].text).toBe("msg 259");
  });

  it("names the agent an id belongs to", () => {
    useStore.getState().addAgentCanvasNode(info("agent-7", "Orion"));
    expect(useStore.getState().labelOf("agent-7")).toBe("Orion");
    expect(useStore.getState().labelOf("gone")).toBe("gone");
  });
});

describe("finding things on the canvas", () => {
  it("matches an agent by name or by which CLI it is", () => {
    const orion = { type: "agent", data: { label: "Orion", harness: "claude" } };
    expect(matchesSearch(orion as never, "ori")).toBe(true);
    expect(matchesSearch(orion as never, "CLAUDE")).toBe(true);
    expect(matchesSearch(orion as never, "codex")).toBe(false);
  });

  it("matches a note by what is written on it", () => {
    const note = { type: "note", data: { note: "check the migration" } };
    expect(matchesSearch(note as never, "migration")).toBe(true);
    expect(matchesSearch(note as never, "deploy")).toBe(false);
  });

  it("matches nothing at all on an empty query", () => {
    const orion = { type: "agent", data: { label: "Orion", harness: "claude" } };
    expect(matchesSearch(orion as never, "   ")).toBe(false);
  });
});

describe("bringing a node into view", () => {
  /** jsdom lays nothing out, so the two measurements `revealNode` makes —
   *  the pane's size and the node's — are supplied by hand. */
  function stage(node: { x: number; y: number }) {
    const pane = document.createElement("div");
    pane.className = "react-flow";
    pane.getBoundingClientRect = () => ({ width: 1440, height: 900 }) as DOMRect;
    document.body.appendChild(pane);

    const el = document.createElement("div");
    el.className = "react-flow__node";
    el.setAttribute("data-id", "a");
    Object.defineProperty(el, "offsetWidth", { value: 624 });
    Object.defineProperty(el, "offsetHeight", { value: 392 });
    document.body.appendChild(el);

    const setViewport = vi.fn();
    useStore.setState({
      flow: {
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
        setViewport,
      } as never,
      nodes: [
        {
          id: "a",
          type: "agent",
          position: node,
          style: { width: 624, height: 392 },
          data: { nodeId: "a", label: "Orion", harness: "claude", cwd: "/w", status: "idle" },
        } as never,
      ],
    });
    return setViewport;
  }

  beforeEach(() => document.body.replaceChildren());

  it("leaves the canvas alone when the node is already on screen", () => {
    const setViewport = stage({ x: 200, y: 200 });
    useStore.getState().revealNode("a");
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("pans to a node parked off screen, keeping the operator's zoom", () => {
    const setViewport = stage({ x: 4000, y: 3000 });
    useStore.getState().revealNode("a");
    expect(setViewport).toHaveBeenCalledTimes(1);

    const [viewport] = setViewport.mock.calls[0];
    expect(viewport.zoom).toBe(1);
    // Centred in the part of the window nothing is floating over.
    const left = 4000 + viewport.x;
    const top = 3000 + viewport.y;
    expect(left).toBeGreaterThanOrEqual(84);
    expect(top).toBeGreaterThanOrEqual(98);
    expect(left + 624).toBeLessThanOrEqual(1440 - 26 - 22);
    expect(top + 392).toBeLessThanOrEqual(900 - 112 - 22);
  });

  it("does nothing before the canvas has told the store about itself", () => {
    const setViewport = stage({ x: 4000, y: 3000 });
    useStore.setState({ flow: null });
    useStore.getState().revealNode("a");
    expect(setViewport).not.toHaveBeenCalled();
  });
});

describe("naming a new agent", () => {
  it("gives each one a name of its own, so two of the same CLI differ", async () => {
    vi.mocked(api.addAgent).mockImplementation(async (args) => ({
      ...info("id-" + args.label, args.label),
      harness: args.harness,
    }));

    await useStore.getState().launchAgent("claude");
    await useStore.getState().launchAgent("claude");

    const names = useStore
      .getState()
      .nodes.filter((n) => n.type === "agent")
      .map((n) => (n.type === "agent" ? n.data.label : ""));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it("keeps the name the operator asked for", async () => {
    vi.mocked(api.addAgent).mockImplementation(async (args) =>
      info("id-1", args.label)
    );
    await useStore.getState().launchAgent("claude", "Sentry");
    expect(api.addAgent).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Sentry" })
    );
  });
});

describe("reading the traffic", () => {
  it("clears the badges that were pointing at it", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.bumpUnread("a");
    st.bumpUnread("a");
    expect(useStore.getState().unread.a).toBe(2);

    useStore.getState().setActivityOpen(true);
    expect(useStore.getState().unread).toEqual({});
  });
});

describe("stopping an agent that had its own worktree", () => {
  it("says where the work is instead of leaving it lost", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a", "Orion"));
    updateNodeData("a", { worktree: "/work/.worktrees/orion-1" });

    useStore.getState().removeNode("a");
    expect(useStore.getState().toasts[0].text).toContain("/work/.worktrees/orion-1");
  });
});

describe("one idea of which window is selected", () => {
  it("marks the node itself, so the ring follows a keyboard selection", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));

    useStore.getState().setSelected("b");
    expect(useStore.getState().nodes.map((n) => !!n.selected)).toEqual([false, true]);

    useStore.getState().setSelected("a");
    expect(useStore.getState().nodes.map((n) => !!n.selected)).toEqual([true, false]);

    useStore.getState().setSelected(null);
    expect(useStore.getState().nodes.every((n) => !n.selected)).toBe(true);
  });

  it("does not rebuild the node list when nothing changed", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setSelected("a");

    const before = useStore.getState().nodes;
    useStore.getState().setSelected("a");
    expect(useStore.getState().nodes).toBe(before);
  });
});

describe("launching a team", () => {
  function launched(): { label: string; harness: string; role: string; prompt: string }[] {
    return vi.mocked(api.addAgent).mock.calls.map(([a]) => a);
  }

  beforeEach(() => {
    useStore.setState({
      harnesses: [
        { name: "claude", label: "Claude Code", available: true, bus: true },
        { name: "codex", label: "Codex", available: true, bus: true },
      ],
    });
    let n = 0;
    vi.mocked(api.addAgent).mockImplementation(async (args) => ({
      ...info(`id-${++n}`, args.label),
      harness: args.harness,
      role: args.role,
    }));
    vi.mocked(api.addEdge).mockResolvedValue(undefined);
  });

  const pair: Team = {
    id: "t",
    label: "Review pair",
    blurb: "",
    members: [
      { harness: "claude", name: "Maker", role: "Writes the code", brief: "you write" },
      { harness: "codex", name: "Reviewer", role: "Objects", brief: "you review" },
    ],
    wires: [[0, 1]],
  };

  it("starts every member with its role and its brief, then wires them", async () => {
    await useStore.getState().launchTeam(pair);

    expect(launched()).toEqual([
      expect.objectContaining({ label: "Maker", harness: "claude", role: "Writes the code", prompt: "you write" }),
      expect.objectContaining({ label: "Reviewer", harness: "codex", role: "Objects", prompt: "you review" }),
    ]);
    expect(api.addEdge).toHaveBeenCalledWith("id-1", "id-2");
    expect(useStore.getState().nodes).toHaveLength(2);
  });

  it("keeps the role on the node, so peers and the canvas agree", async () => {
    await useStore.getState().launchTeam(pair);
    const roles = useStore
      .getState()
      .nodes.map((n) => (n.type === "agent" ? n.data.role : ""));
    expect(roles).toEqual(["Writes the code", "Objects"]);
  });

  it("falls back to an installed CLI when the template names a missing one", async () => {
    useStore.setState({
      harnesses: [{ name: "claude", label: "Claude Code", available: true, bus: true }],
    });
    await useStore.getState().launchTeam(pair);
    expect(launched().map((a) => a.harness)).toEqual(["claude", "claude"]);
  });

  it("still wires up the members that did start", async () => {
    vi.mocked(api.addAgent)
      .mockResolvedValueOnce(info("id-1", "Maker"))
      .mockRejectedValueOnce(new Error("codex did not start"));

    await useStore.getState().launchTeam(pair);
    expect(api.addEdge).not.toHaveBeenCalled();
    expect(useStore.getState().nodes).toHaveLength(1);
    expect(useStore.getState().toasts.some((t) => t.text.includes("1 of 2"))).toBe(true);
  });

  it("refuses before a working folder is chosen", async () => {
    useStore.setState({ workspaceRoot: "" });
    await useStore.getState().launchTeam(pair);
    expect(api.addAgent).not.toHaveBeenCalled();
    expect(useStore.getState().toasts[0].text).toContain("working folder");
  });
});

describe("saving a canvas as a team", () => {
  it("captures the roles and the wires, and nothing that cannot come back", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode({ ...info("a", "Maker"), role: "Writes the code" });
    st.addAgentCanvasNode({ ...info("b", "Reviewer"), role: "Objects" });
    st.edgesChanged([["a", "b"]]);

    const team = useStore.getState().teamFromCanvas("My pair");
    expect(team).not.toBeNull();
    expect(team!.label).toBe("My pair");
    expect(team!.members.map((m) => [m.name, m.role])).toEqual([
      ["Maker", "Writes the code"],
      ["Reviewer", "Objects"],
    ]);
    expect(team!.wires).toEqual([[0, 1]]);
    expect(team!.members[0].brief).toContain("Writes the code");
  });

  it("is nothing when there is nothing on the canvas", () => {
    expect(useStore.getState().teamFromCanvas("Empty")).toBeNull();
  });

  it("does not save a stand-in that never became an agent", async () => {
    vi.mocked(api.addAgent).mockReturnValue(new Promise<NodeInfo>(() => {}));
    void useStore.getState().launchAgent("claude");
    expect(useStore.getState().teamFromCanvas("Half")).toBeNull();
  });
});

describe("telling the operator the work is done", () => {
  beforeEach(() => {
    vi.mocked(notify.away).mockReturnValue(true);
    useStore.setState({ notifications: true });
  });

  it("fires once, when the last busy agent goes quiet", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.addAgentCanvasNode(info("b"));

    st.setStatus("a", "running");
    st.setStatus("b", "running");
    expect(notify.notify).not.toHaveBeenCalled();

    st.setStatus("a", "idle");
    expect(notify.notify).not.toHaveBeenCalled(); // b is still working

    st.setStatus("b", "idle");
    expect(notify.notify).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify.notify).mock.calls[0][1]).toContain("2 agents");
  });

  it("counts an agent waiting on a prompt as still working", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setStatus("a", "running");
    st.setStatus("a", "waiting");
    expect(notify.notify).not.toHaveBeenCalled();

    st.setStatus("a", "idle");
    expect(notify.notify).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the operator is looking at the window", () => {
    vi.mocked(notify.away).mockReturnValue(false);
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setStatus("a", "running");
    st.setStatus("a", "idle");
    expect(notify.notify).not.toHaveBeenCalled();
  });

  it("says nothing when the operator turned notifications off", () => {
    useStore.setState({ notifications: false });
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setStatus("a", "running");
    st.setStatus("a", "idle");
    expect(notify.notify).not.toHaveBeenCalled();
  });

  it("does not fire on a status change that was never busy", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("a"));
    st.setStatus("a", "idle");
    st.setStatus("a", "exited");
    expect(notify.notify).not.toHaveBeenCalled();
  });
});

describe("the shared board on the canvas", () => {
  it("takes a task off when the Bus says it is gone", () => {
    const st = useStore.getState();
    const task = (id: string, title: string): Task => ({
      id,
      title,
      details: "",
      status: "todo",
      owner: null,
      result: "",
    });
    st.upsertTask(task("t1", "one"));
    st.upsertTask(task("t2", "two"));
    expect(useStore.getState().tasks).toHaveLength(2);

    useStore.getState().dropTask("t1");
    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(["t2"]);
  });

  it("updates a task in place rather than listing it twice", () => {
    const st = useStore.getState();
    st.upsertTask({ id: "t1", title: "one", details: "", status: "todo", owner: null, result: "" });
    st.upsertTask({ id: "t1", title: "one", details: "", status: "done", owner: "a", result: "ok" });

    const tasks = useStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: "done", owner: "a", result: "ok" });
  });
});

describe("an agent another agent started", () => {
  it("lands on the canvas with its role, beside the work and not on top of it", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("boss", "Boss"));

    // Arrives as a bus event, not through launchAgent: nothing on the canvas
    // asked for it, so there is no stand-in and no slot reserved.
    const id = useStore.getState().addAgentCanvasNode({
      ...info("hired", "Hired"),
      harness: "opencode",
      role: "Does what the orchestrator asks",
    });

    const nodes = useStore.getState().nodes;
    expect(nodes).toHaveLength(2);
    const hired = nodes.find((n) => n.id === id);
    expect(hired?.type === "agent" && hired.data.role).toBe("Does what the orchestrator asks");
    expect(hired?.type === "agent" && hired.data.harness).toBe("opencode");

    const boxes = nodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: Number(n.style?.width),
      h: Number(n.style?.height),
    }));
    const [a, b] = boxes;
    const apart =
      a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
    expect(apart, "a hired agent must not land on top of its hirer").toBe(true);
  });

  it("does not arrive twice if the Bus says so twice", () => {
    const st = useStore.getState();
    st.addAgentCanvasNode(info("hired", "Hired"));
    st.addAgentCanvasNode(info("hired", "Hired"));
    expect(useStore.getState().nodes).toHaveLength(1);
  });
});

describe("finding an agent by what it did", () => {
  it("matches on its scrollback, not just its name", () => {
    const orion = {
      type: "agent",
      data: { nodeId: "a", label: "Orion", harness: "claude", role: "" },
    };
    vi.mocked(terminals.contains).mockReturnValue(false);
    expect(matchesSearch(orion as never, "auth.ts")).toBe(false);

    vi.mocked(terminals.contains).mockReturnValue(true);
    expect(matchesSearch(orion as never, "auth.ts")).toBe(true);
    expect(terminals.contains).toHaveBeenCalledWith("a", "auth.ts");
  });

  it("matches on the role, so you can find whoever reviews", () => {
    vi.mocked(terminals.contains).mockReturnValue(false);
    const node = {
      type: "agent",
      data: { nodeId: "a", label: "Juno", harness: "codex", role: "Reviews the work" },
    };
    expect(matchesSearch(node as never, "reviews")).toBe(true);
  });
});

describe("picking a session back up", () => {
  it("rebuilds the last canvas as a team, without starting anything", async () => {
    vi.mocked(api.loadWorkspace).mockResolvedValue(
      JSON.stringify({
        version: 1,
        nodes: [
          { id: "a", type: "agent", position: { x: 0, y: 0 }, data: { label: "Maker", harness: "claude", role: "Writes the code" } },
          { id: "b", type: "agent", position: { x: 0, y: 0 }, data: { label: "Reviewer", harness: "codex", role: "Objects" } },
          { id: "n1", type: "note", position: { x: 0, y: 0 }, data: { note: "keep me", label: "note" } },
        ],
        edges: [{ source: "a", target: "b" }],
      })
    );

    await useStore.getState().restoreWorkspace();
    const st = useStore.getState();

    // Nothing was launched: four CLIs starting because someone opened the app
    // would be a rude surprise and a real bill.
    expect(api.addAgent).not.toHaveBeenCalled();
    expect(st.nodes.map((n) => n.type)).toEqual(["note"]);

    expect(st.resumable).not.toBeNull();
    expect(st.resumable!.members.map((m) => [m.name, m.harness, m.role])).toEqual([
      ["Maker", "claude", "Writes the code"],
      ["Reviewer", "codex", "Objects"],
    ]);
    expect(st.resumable!.wires).toEqual([[0, 1]]);
    expect(st.resumable!.members[0].brief).toContain("Writes the code");
  });

  it("offers nothing when the last session had no agents", async () => {
    vi.mocked(api.loadWorkspace).mockResolvedValue(
      JSON.stringify({ version: 1, nodes: [], edges: [] })
    );
    await useStore.getState().restoreWorkspace();
    expect(useStore.getState().resumable).toBeNull();
  });

  it("does not offer a stand-in that never became an agent", async () => {
    vi.mocked(api.loadWorkspace).mockResolvedValue(
      JSON.stringify({
        version: 1,
        nodes: [
          { id: "p", type: "agent", position: { x: 0, y: 0 }, data: { label: "Starting", harness: "claude", pending: true } },
        ],
        edges: [],
      })
    );
    await useStore.getState().restoreWorkspace();
    expect(useStore.getState().resumable).toBeNull();
  });

  it("survives a workspace file that is not valid JSON", async () => {
    vi.mocked(api.loadWorkspace).mockResolvedValue("{ not json");
    await expect(useStore.getState().restoreWorkspace()).resolves.toBeUndefined();
    expect(useStore.getState().resumable).toBeNull();
  });
});

describe("errands", () => {
  it("sends an agent out and brings it back on its own", () => {
    vi.useFakeTimers();
    try {
      const st = useStore.getState();
      st.runErrand("a1", { kind: "board", text: "took a task" });
      expect(useStore.getState().errands.a1?.errand).toEqual({
        kind: "board",
        text: "took a task",
      });

      vi.advanceTimersByTime(ERRAND_MS - 1);
      expect(useStore.getState().errands.a1).toBeDefined();

      vi.advanceTimersByTime(1);
      expect(useStore.getState().errands.a1).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a newer trip replace one already running", () => {
    vi.useFakeTimers();
    try {
      const st = useStore.getState();
      st.runErrand("a1", { kind: "board", text: "took a task" });
      vi.advanceTimersByTime(ERRAND_MS - 100);
      st.runErrand("a1", { kind: "peer", peer: "a2", text: "over to you" });

      // The first errand's timer fires here and must not cancel the second.
      vi.advanceTimersByTime(100);
      expect(useStore.getState().errands.a1?.errand).toMatchObject({ kind: "peer" });

      // The second one still clears on its own schedule.
      vi.advanceTimersByTime(ERRAND_MS);
      expect(useStore.getState().errands.a1).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps agents' trips apart", () => {
    vi.useFakeTimers();
    try {
      const st = useStore.getState();
      st.runErrand("a1", { kind: "board", text: "one" });
      st.runErrand("a2", { kind: "board", text: "two" });
      expect(Object.keys(useStore.getState().errands).sort()).toEqual(["a1", "a2"]);
      vi.advanceTimersByTime(ERRAND_MS);
      expect(useStore.getState().errands).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});
