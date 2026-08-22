import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import { api } from "./api";
import type {
  Approval,
  CanvasNode,
  HarnessInfo,
  MemoryEntry,
  NodeInfo,
  Task,
  Theme,
  Toast,
} from "./types";

export const EDGE_STYLE = { stroke: "#3d8bfd", strokeWidth: 1.6 };

let toastSeq = 0;

interface StoreState {
  nodes: CanvasNode[];
  edges: Edge[];
  outputs: Record<string, string>;
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

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodes: (nodes: CanvasNode[] | ((n: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (edges: Edge[] | ((e: Edge[]) => Edge[])) => void;

  addAgentCanvasNode: (info: NodeInfo) => string;
  addNote: (text?: string) => void;
  addTaskBoard: () => void;
  launchAgent: (harness: string, label?: string, prompt?: string) => Promise<string | null>;
  removeNode: (id: string) => void;

  appendOutput: (nodeId: string, chunk: string) => void;
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
  addMemoryNode: () => void;
  refreshMemory: () => Promise<void>;
  loadHarnesses: () => Promise<void>;
  edgesChanged: (pairs: [string, string][]) => void;

  saveWorkspace: (silent?: boolean) => Promise<void>;
  restoreWorkspace: () => Promise<void>;
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

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  setNodes: (nodes) =>
    set((s) => ({ nodes: typeof nodes === "function" ? nodes(s.nodes) : nodes })),

  setEdges: (edges) =>
    set((s) => ({ edges: typeof edges === "function" ? edges(s.edges) : edges })),

  addAgentCanvasNode: (info) => {
    const count = get().nodes.filter((n) => n.type === "agent").length;
    const id = info.id;
    const col = count % 2;
    const row = Math.floor(count / 2);
    const node: CanvasNode = {
      id,
      type: "agent",
      position: { x: 80 + col * 560 + row * 40, y: 70 + row * 392 },
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
    let cwd = workspaceRoot;
    let worktree: string | undefined;

    // An agent in its own worktree cannot collide with its peers' edits.
    if (useWorktrees) {
      const seq = nodes.filter((n) => n.type === "agent").length + 1;
      try {
        cwd = await api.createWorktree(workspaceRoot, `${name}-${seq}`);
        worktree = cwd;
      } catch (e) {
        get().pushToast("err", `Worktree not created — ${String(e)}`);
        return null;
      }
    }

    try {
      const info = await api.addAgent({ label: name, harness, cwd, prompt });
      if (!info) {
        get().pushToast("err", `Could not start ${harness}.`);
        return null;
      }
      const id = get().addAgentCanvasNode(info);
      if (worktree) updateNodeData(id, { worktree });
      return info.id;
    } catch (e) {
      get().pushToast("err", `${harness} did not start — ${String(e)}`);
      return null;
    }
  },

  removeNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node?.type === "agent") void api.killAgent(node.data.nodeId).catch(() => undefined);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
  },

  appendOutput: (nodeId, chunk) =>
    set((s) => {
      const next = (s.outputs[nodeId] ?? "") + chunk;
      let tail = next;
      if (tail.length > 24000) {
        const cut = tail.slice(-24000);
        const nl = cut.indexOf("\n");
        tail = nl >= 0 ? cut.slice(nl + 1) : cut;
      }
      return { outputs: { ...s.outputs, [nodeId]: tail } };
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

  clearOutputs: () => set({ outputs: {} }),

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

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

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
      nodes: nodes.map((n) => ({
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
