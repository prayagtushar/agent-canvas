import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { api } from "./api";
import type {
  Approval,
  CanvasNode,
  HarnessInfo,
  CommState,
  MemoryEntry,
  Usage,
  NodeInfo,
  Task,
  Theme,
  Toast,
} from "./types";

export const EDGE_STYLE = { stroke: "var(--wire)", strokeWidth: 1.7 };

/** Characters of agent output kept per node. Past this the front is dropped. */
const SCROLLBACK = 24000;

/** Pixels of each window edge covered by floating chrome: title bar and comm
   chips on top, the rail on the left, the toolbar and command bar below. */
const CHROME = { top: 76, right: 26, bottom: 112, left: 62 };

/** Breathing room between the chrome and the outermost node. */
const GUTTER = 22;

let toastSeq = 0;
let pendingSeq = 0;

/** Must match the `.toast.leaving` animation in styles.css. */
const TOAST_EXIT_MS = 200;

interface StoreState {
  nodes: CanvasNode[];
  edges: Edge[];
  outputs: Record<string, string>;
  /** Lines dropped off the front of each transcript, so line keys stay stable. */
  trimmed: Record<string, number>;
  statuses: Record<string, string>;
  unread: Record<string, number>;
  tasks: Task[];
  approvals: Approval[];
  toasts: Toast[];
  selectedNodeId: string | null;
  harnesses: HarnessInfo[];
  zoom: number;
  search: string;
  tint: number;
  focus: boolean;
  shortcutsOpen: boolean;
  theme: Theme;
  /** Folder agents are launched in. Chosen by the operator, never assumed. */
  workspaceRoot: string;
  /** Give each new agent its own git worktree when the folder is a repo. */
  useWorktrees: boolean;
  memory: MemoryEntry[];
  comm: CommState;
  usage: Record<string, Usage>;
  /** Per-wire message counter. Bumping one replays the bead on that wire. */
  pulses: Record<string, { seq: number; reverse: boolean }>;
  /** Set on canvas init so anything can frame the view. */
  flow: ReactFlowInstance<CanvasNode, Edge> | null;

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodes: (nodes: CanvasNode[] | ((n: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (edges: Edge[] | ((e: Edge[]) => Edge[])) => void;

  addAgentCanvasNode: (info: NodeInfo, at?: { x: number; y: number }) => string;
  addNote: (text?: string) => void;
  addTaskBoard: () => void;
  launchAgent: (harness: string, label?: string, prompt?: string) => Promise<string | null>;
  removeNode: (id: string) => void;

  appendOutput: (nodeId: string, chunk: string) => void;
  appendOutputs: (batch: Record<string, string>) => void;
  setStatus: (nodeId: string, status: string) => void;
  bumpUnread: (nodeId: string) => void;
  clearUnread: (nodeId: string) => void;
  clearOutputs: () => void;

  upsertTask: (t: Task) => void;
  upsertApproval: (a: Approval) => void;
  removeApproval: (id: string) => void;

  pushToast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;

  setSelected: (id: string | null) => void;
  setZoom: (z: number) => void;
  setSearch: (s: string) => void;
  setTint: (t: number) => void;
  setFocus: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setWorkspaceRoot: (p: string) => void;
  setUseWorktrees: (v: boolean) => void;
  setMemory: (m: MemoryEntry[]) => void;
  setComm: (c: CommState) => void;
  addUsage: (nodeId: string, u: Usage) => void;
  pulseWire: (from: string, to: string) => void;
  setFlow: (f: ReactFlowInstance<CanvasNode, Edge>) => void;
  frameAll: () => void;
  promptAll: (text: string) => number;
  refreshComm: () => Promise<void>;
  addMemoryNode: () => void;
  refreshMemory: () => Promise<void>;
  loadHarnesses: () => Promise<void>;
  edgesChanged: (pairs: [string, string][]) => void;

  saveWorkspace: (silent?: boolean) => Promise<void>;
  restoreWorkspace: () => Promise<void>;
}

/* The box every node occupies, in canvas coordinates. xyflow's own
   `getNodesBounds` reads `node.measured`, which it keeps on its internal
   nodes and never writes back to the ones `getNodes()` hands out, so it
   returns a zero-size box here. The rendered elements know their real size:
   `offsetWidth` is the layout size, before the canvas transform scales it. */
function nodesBox(nodes: CanvasNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const el = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${CSS.escape(n.id)}"]`
    );
    const w = el?.offsetWidth || Number(n.style?.width) || 240;
    const h = el?.offsetHeight || Number(n.style?.height) || 160;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/* Where the next agent window goes: two columns, stepped slightly right on
   each new row so a deep canvas still reads as a stack of pairs. */
function agentSlot(nodes: CanvasNode[]): { x: number; y: number } {
  const count = nodes.filter((n) => n.type === "agent").length;
  const col = count % 2;
  const row = Math.floor(count / 2);
  return { x: 80 + col * 560 + row * 40, y: 70 + row * 392 };
}

/* Right edge of everything currently placed, so new items land beside the
   work instead of on top of it. */
function rightEdge(nodes: CanvasNode[]): number {
  if (nodes.length === 0) return 0;
  return Math.max(
    ...nodes.map((n) => n.position.x + (Number(n.style?.width) || 240))
  );
}

export const useStore = create<StoreState>()((set, get) => ({
  nodes: [],
  edges: [],
  outputs: {},
  trimmed: {},
  statuses: {},
  unread: {},
  tasks: [],
  approvals: [],
  toasts: [],
  selectedNodeId: null,
  harnesses: [],
  zoom: 100,
  search: "",
  tint: Number(localStorage.getItem("ac.tint") ?? 0.36),
  focus: false,
  shortcutsOpen: false,
  theme: (localStorage.getItem("ac.theme") as Theme) ?? "midnight",
  workspaceRoot: localStorage.getItem("ac.workspaceRoot") ?? "",
  useWorktrees: localStorage.getItem("ac.useWorktrees") === "1",
  memory: [],
  comm: { autoComm: true, sent: 0, cap: 200 },
  usage: {},
  pulses: {},
  flow: null,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  setNodes: (nodes) =>
    set((s) => ({ nodes: typeof nodes === "function" ? nodes(s.nodes) : nodes })),

  setEdges: (edges) =>
    set((s) => ({ edges: typeof edges === "function" ? edges(s.edges) : edges })),

  addAgentCanvasNode: (info, at) => {
    const id = info.id;
    const node: CanvasNode = {
      id,
      type: "agent",
      position: at ?? agentSlot(get().nodes),
      style: { width: 512, height: 336 },
      data: {
        nodeId: info.id,
        label: info.label,
        harness: info.harness,
        cwd: info.cwd,
        status: "idle",
      },
    };
    set((s) => ({ nodes: [...s.nodes.filter((n) => n.id !== id), node] }));
    return id;
  },

  addNote: (text = "") => {
    const nodes = get().nodes;
    const noteCount = nodes.filter((n) => n.type === "note").length;
    const node: CanvasNode = {
      id: `note-${Date.now()}`,
      type: "note",
      position: { x: rightEdge(nodes) + 40, y: 70 + noteCount * 40 },
      data: { note: text, label: "note" },
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
  },

  addTaskBoard: () => {
    const existing = get().nodes.find((n) => n.type === "taskboard");
    if (existing) {
      get().pushToast("ok", "The project card is already on the canvas.");
      return;
    }
    const node: CanvasNode = {
      id: `taskboard-${Date.now()}`,
      type: "taskboard",
      position: { x: rightEdge(get().nodes) + 40, y: 70 },
      data: {},
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
  },

  launchAgent: async (harness, label, prompt = "") => {
    const { workspaceRoot, useWorktrees, nodes } = get();
    if (!workspaceRoot) {
      get().pushToast("err", "Choose a working folder first — the folder button in the toolbar.");
      return null;
    }
    const name = label || harness;

    // Put a stand-in on the canvas before doing any of the slow work. Adding a
    // worktree runs git and starting an agent spawns a process, so without
    // this the click closes a menu and nothing happens for a second or two.
    const slot = agentSlot(nodes);
    const holder = `pending-${++pendingSeq}`;
    set((s) => ({
      nodes: [
        ...s.nodes,
        {
          id: holder,
          type: "agent",
          position: slot,
          style: { width: 512, height: 336 },
          data: {
            nodeId: holder,
            label: name,
            harness,
            cwd: workspaceRoot,
            status: "starting",
            pending: true,
          },
        } as CanvasNode,
      ],
    }));
    get().frameAll();
    const dropHolder = () =>
      set((s) => ({ nodes: s.nodes.filter((n) => n.id !== holder) }));

    let cwd = workspaceRoot;
    let worktree: string | undefined;

    // An agent in its own worktree cannot collide with its peers' edits.
    if (useWorktrees) {
      const seq = nodes.filter((n) => n.type === "agent").length + 1;
      try {
        cwd = await api.createWorktree(workspaceRoot, `${name}-${seq}`);
        worktree = cwd;
      } catch (e) {
        dropHolder();
        get().pushToast("err", `Worktree not created — ${String(e)}`);
        return null;
      }
    }

    try {
      const info = await api.addAgent({ label: name, harness, cwd, prompt });
      if (!info) {
        dropHolder();
        get().pushToast("err", `Could not start ${harness}.`);
        return null;
      }
      dropHolder();
      const id = get().addAgentCanvasNode(info, slot);
      if (worktree) updateNodeData(id, { worktree });
      return info.id;
    } catch (e) {
      dropHolder();
      get().pushToast("err", `${harness} did not start — ${String(e)}`);
      return null;
    }
  },

  removeNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node?.type === "agent" && !node.data.pending) {
      void api.killAgent(node.data.nodeId).catch(() => undefined);
    }
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
  },

  appendOutput: (nodeId, chunk) => get().appendOutputs({ [nodeId]: chunk }),

  /* One store write for a whole frame's worth of output from every agent.
     Agent CLIs emit in small bursts, and a `set` per chunk had each node
     re-rendering its entire transcript dozens of times a second. */
  appendOutputs: (batch) =>
    set((s) => {
      const outputs = { ...s.outputs };
      let trimmed: Record<string, number> | null = null;

      for (const nodeId of Object.keys(batch)) {
        const next = (s.outputs[nodeId] ?? "") + batch[nodeId];
        if (next.length <= SCROLLBACK) {
          outputs[nodeId] = next;
          continue;
        }
        // Drop from the front on a line boundary, and count the lines that
        // went. The transcript keys lines by absolute position in the stream;
        // without this count every trim would renumber the whole buffer and
        // replay the arrival animation across all of it.
        const cut = next.slice(-SCROLLBACK);
        const nl = cut.indexOf("\n");
        const tail = nl >= 0 ? cut.slice(nl + 1) : cut;
        const dropped = next.slice(0, next.length - tail.length);
        let lines = 0;
        for (let i = 0; i < dropped.length; i++) if (dropped[i] === "\n") lines++;
        outputs[nodeId] = tail;
        trimmed = trimmed ?? { ...s.trimmed };
        trimmed[nodeId] = (s.trimmed[nodeId] ?? 0) + lines;
      }

      return trimmed ? { outputs, trimmed } : { outputs };
    }),

  setStatus: (nodeId, status) =>
    set((s) => ({ statuses: { ...s.statuses, [nodeId]: status } })),

  bumpUnread: (nodeId) =>
    set((s) => {
      if (s.selectedNodeId === nodeId) return s;
      return { unread: { ...s.unread, [nodeId]: (s.unread[nodeId] ?? 0) + 1 } };
    }),

  clearUnread: (nodeId) =>
    set((s) => (s.unread[nodeId] ? { unread: { ...s.unread, [nodeId]: 0 } } : s)),

  clearOutputs: () => set({ outputs: {}, trimmed: {} }),

  upsertTask: (t) =>
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.id === t.id);
      if (idx === -1) return { tasks: [...s.tasks, t] };
      const tasks = s.tasks.slice();
      tasks[idx] = { ...tasks[idx], ...t };
      return { tasks };
    }),

  upsertApproval: (a) =>
    set((s) => {
      const idx = s.approvals.findIndex((x) => x.id === a.id);
      if (idx === -1) return { approvals: [...s.approvals, a] };
      const approvals = s.approvals.slice();
      approvals[idx] = { ...approvals[idx], ...a };
      return { approvals };
    }),

  removeApproval: (id) =>
    set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) })),

  pushToast: (kind, text) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), kind === "err" ? 6000 : 3200);
  },

  /** Flag it first so the card can animate out, then drop it. */
  dismissToast: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      TOAST_EXIT_MS
    );
  },

  setSelected: (id) =>
    set((s) => {
      if (id === null) return s.selectedNodeId === null ? s : { selectedNodeId: null };
      if (s.selectedNodeId === id) return s;
      return { selectedNodeId: id, unread: { ...s.unread, [id]: 0 } };
    }),

  setZoom: (z) => set({ zoom: Math.round(z) }),
  setSearch: (search) => set({ search }),

  setTint: (t) => {
    localStorage.setItem("ac.tint", String(t));
    set({ tint: t });
  },

  setFocus: (focus) => set({ focus }),

  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  setTheme: (theme) => {
    localStorage.setItem("ac.theme", theme);
    set({ theme });
  },

  setWorkspaceRoot: (workspaceRoot) => {
    localStorage.setItem("ac.workspaceRoot", workspaceRoot);
    set({ workspaceRoot });
  },

  setUseWorktrees: (useWorktrees) => {
    localStorage.setItem("ac.useWorktrees", useWorktrees ? "1" : "0");
    set({ useWorktrees });
  },

  setMemory: (memory) => set({ memory }),

  setFlow: (flow) => set({ flow }),

  /** Bring every node into view, inside the chrome rather than under it.
   *  The canvas fills the window and the title bar, rail and command bar float
   *  on top of it, so `fitView` centres in the whole window and parks the top
   *  agent under the title bar. This centres in what is actually visible. */
  frameAll: () => {
    const flow = get().flow;
    if (!flow) return;
    // A beat, so nodes added in the same tick are in the DOM to be measured.
    setTimeout(() => {
      const pane = document.querySelector(".react-flow");
      const box = nodesBox(get().nodes);
      if (!pane || !box || box.width === 0 || box.height === 0) return;

      const { width, height } = pane.getBoundingClientRect();

      const free = {
        x: CHROME.left + GUTTER,
        y: CHROME.top + GUTTER,
        w: Math.max(160, width - CHROME.left - CHROME.right - GUTTER * 2),
        h: Math.max(160, height - CHROME.top - CHROME.bottom - GUTTER * 2),
      };
      const zoom = Math.min(free.w / box.width, free.h / box.height, 1);
      void flow.setViewport(
        {
          zoom,
          x: free.x + (free.w - box.width * zoom) / 2 - box.x * zoom,
          y: free.y + (free.h - box.height * zoom) / 2 - box.y * zoom,
        },
        // The animation is driven by requestAnimationFrame, which a hidden
        // window does not run: an agent launched while the app is in the
        // background would leave the viewport wherever it was. Jump instead.
        { duration: document.hidden ? 0 : 320 }
      );
    }, 60);
  },

  /** Send one prompt to every idle agent. Returns how many got it. */
  promptAll: (text) => {
    const { nodes, statuses } = get();
    const targets = nodes
      .filter((n): n is import("./types").AgentFlowNode => n.type === "agent")
      .filter((n) => statuses[n.data.nodeId] !== "running");
    targets.forEach((n) =>
      api.sendPrompt(n.data.nodeId, text).catch(() => undefined)
    );
    return targets.length;
  },

  setComm: (comm) => set({ comm }),

  addUsage: (nodeId, u) =>
    set((s) => {
      const prev = s.usage[nodeId] ?? { tokensIn: 0, tokensOut: 0, costUsd: 0 };
      return {
        usage: {
          ...s.usage,
          [nodeId]: {
            tokensIn: prev.tokensIn + u.tokensIn,
            tokensOut: prev.tokensOut + u.tokensOut,
            costUsd: prev.costUsd + u.costUsd,
          },
        },
      };
    }),

  /** Fire the travelling bead on the wire joining two agents. The Bus stores
   *  peers as unordered pairs, so the wire may be drawn either way round;
   *  `reverse` tells the edge which way the message actually went. */
  pulseWire: (from, to) =>
    set((s) => {
      const forward = `bus-${from}-${to}`;
      const backward = `bus-${to}-${from}`;
      const has = (id: string) => s.edges.some((e) => e.id === id);
      const id = has(forward) ? forward : has(backward) ? backward : null;
      if (!id) return s;
      const seq = (s.pulses[id]?.seq ?? 0) + 1;
      return { pulses: { ...s.pulses, [id]: { seq, reverse: id === backward } } };
    }),

  refreshComm: async () => {
    try {
      set({ comm: await api.getCommState() });
    } catch {
      /* the Bus may not be up yet */
    }
  },

  addMemoryNode: () => {
    if (get().nodes.some((n) => n.type === "memory")) {
      get().pushToast("ok", "Shared memory is already on the canvas.");
      return;
    }
    const node: CanvasNode = {
      id: `memory-${Date.now()}`,
      type: "memory",
      position: { x: rightEdge(get().nodes) + 40, y: 70 },
      data: {},
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
  },

  refreshMemory: async () => {
    try {
      set({ memory: await api.listMemory() });
    } catch {
      /* the Bus may not be up yet */
    }
  },

  loadHarnesses: async () => {
    try {
      set({ harnesses: await api.listHarnesses() });
    } catch {
      set({ harnesses: [] });
    }
  },

  // The Bus owns the peer graph; mirror it onto the canvas verbatim.
  edgesChanged: (pairs) =>
    set(() => ({
      edges: pairs.map(([a, b]) => ({
        id: `bus-${a}-${b}`,
        type: "wire",
        source: a,
        target: b,
        style: EDGE_STYLE,
      })),
    })),

  saveWorkspace: async (silent = false) => {
    const { nodes, edges, tint } = get();
    const json = JSON.stringify({
      version: 1,
      tint,
      nodes: nodes
        .filter((n) => !(n.type === "agent" && n.data.pending))
        .map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
          style: n.style ?? null,
        })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    });
    try {
      await api.saveWorkspace(json);
    } catch (e) {
      if (!silent) get().pushToast("err", `Workspace not saved — ${String(e)}`);
    }
  },

  // Agent processes do not survive a restart, so only the layout of
  // notes and the project card comes back.
  restoreWorkspace: async () => {
    try {
      const raw = await api.loadWorkspace();
      if (!raw) return;
      const file = JSON.parse(raw) as {
        tint?: number;
        nodes?: { id: string; type: string; position: { x: number; y: number }; data: unknown }[];
      };
      if (typeof file.tint === "number") set({ tint: file.tint });
      const restorable = (file.nodes ?? []).filter(
        (n) => n.type === "note" || n.type === "taskboard" || n.type === "memory"
      ) as unknown as CanvasNode[];
      if (restorable.length) set({ nodes: restorable });
    } catch {
      /* a corrupt workspace should never block startup */
    }
  },
}));

export function updateNodeData(id: string, data: Partial<Record<string, unknown>>): void {
  useStore.getState().setNodes((nds) =>
    nds.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...data } } as CanvasNode) : n))
  );
}
