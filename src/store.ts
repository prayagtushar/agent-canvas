import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, noAgentsReason } from "./api";
import { buildReport, reportFilename } from "./report";
import { away, notify as sendDesktopNotification } from "./notify";
import * as terminals from "./terminals";
import type {
  Activity,
  Team,
  Approval,
  CanvasNode,
  HarnessInfo,
  CommState,
  MemoryEntry,
  NodeInfo,
  Task,
  Theme,
  Toast,
} from "./types";

export const EDGE_STYLE = { stroke: "var(--wire)", strokeWidth: 1.7 };

/** A new agent window. Sized so the CLI inside it gets the ~80 columns its
 *  layout is drawn for, rather than one it has to fold everything into. */
export const NODE_SIZE = { width: 624, height: 392 };

/** Pixels of each window edge covered by floating chrome: title bar and comm
   chips on top, the rail on the left, the toolbar and command bar below. */
const CHROME = { top: 76, right: 26, bottom: 112, left: 62 };

/** Breathing room between the chrome and the outermost node. */
const GUTTER = 22;

/** When this canvas opened. The session report measures from here. */
const SESSION_STARTED = Date.now();

let toastSeq = 0;
let pendingSeq = 0;
let activitySeq = 0;

/** Must match the `.toast.leaving` animation in styles.css. */
const TOAST_EXIT_MS = 200;

/** Peer traffic worth keeping in the panel. Older lines fall off the top. */
const ACTIVITY_MAX = 200;

/** Prompts the operator has sent, recalled with ↑ in the command bar. */
const HISTORY_MAX = 50;
const HISTORY_KEY = "ac.history";

function readHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface StoreState {
  nodes: CanvasNode[];
  edges: Edge[];
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
  /** The office: the same agents, seen as a room rather than a graph. */
  officeOpen: boolean;
  shortcutsOpen: boolean;
  diagnosticsOpen: boolean;
  /** The agent whose diff is on screen, if any. */
  changesFor: string | null;
  /** Tell the desktop when something needs the operator and they are away. */
  notifications: boolean;
  theme: Theme;
  /** Folder agents are launched in. Chosen by the operator, never assumed. */
  workspaceRoot: string;
  /** Give each new agent its own git worktree when the folder is a repo. */
  useWorktrees: boolean;
  memory: MemoryEntry[];
  comm: CommState;
  /** Send the next prompt to every agent rather than the selected one. */
  broadcast: boolean;
  /** Every message that has crossed a wire this session, oldest first. */
  activity: Activity[];
  activityOpen: boolean;
  /** Activity entries the operator has not seen, for the titlebar count. */
  activitySeen: number;
  /** Prompts already sent, newest first. Recalled with ↑ and persisted. */
  history: string[];
  /** Per-wire message counter. Bumping one replays the bead on that wire. */
  pulses: Record<string, { seq: number; reverse: boolean }>;
  /** The agents that were on the canvas when it last closed, as a team that
   *  can be started again. Null when the last session had none. */
  resumable: Team | null;
  /** Set on canvas init so anything can frame the view. */
  flow: ReactFlowInstance<CanvasNode, Edge> | null;

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodes: (nodes: CanvasNode[] | ((n: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (edges: Edge[] | ((e: Edge[]) => Edge[])) => void;

  addAgentCanvasNode: (info: NodeInfo, at?: { x: number; y: number }) => string;
  addNote: (text?: string) => void;
  addTaskBoard: () => void;
  launchAgent: (
    harness: string,
    label?: string,
    prompt?: string,
    role?: string
  ) => Promise<string | null>;
  launchTeam: (team: Team) => Promise<void>;
  teamFromCanvas: (label: string) => Team | null;
  forgetResumable: () => void;
  removeNode: (id: string) => void;

  setStatus: (nodeId: string, status: string) => void;
  bumpUnread: (nodeId: string) => void;
  clearTerminals: () => void;

  upsertTask: (t: Task) => void;
  dropTask: (id: string) => void;
  refreshTasks: () => Promise<void>;
  upsertApproval: (a: Approval) => void;
  removeApproval: (id: string) => void;

  pushToast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;

  setSelected: (id: string | null) => void;
  setZoom: (z: number) => void;
  setSearch: (s: string) => void;
  setTint: (t: number) => void;
  setFocus: (v: boolean) => void;
  setOfficeOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setDiagnosticsOpen: (v: boolean) => void;
  setChangesFor: (id: string | null) => void;
  setNotifications: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  setWorkspaceRoot: (p: string) => void;
  setUseWorktrees: (v: boolean) => void;
  setMemory: (m: MemoryEntry[]) => void;
  setComm: (c: CommState) => void;
  pulseWire: (from: string, to: string) => void;
  setFlow: (f: ReactFlowInstance<CanvasNode, Edge>) => void;
  frameAll: () => void;
  revealNode: (id: string) => void;
  setBroadcast: (v: boolean) => void;
  stopEverything: (why: string) => void;
  logMessage: (from: string, to: string, text: string) => void;
  setActivityOpen: (v: boolean) => void;
  clearActivity: () => void;
  pushHistory: (text: string) => void;
  labelOf: (id: string) => string;
  promptAll: (text: string) => number;
  refreshComm: () => Promise<void>;
  addMemoryNode: () => void;
  refreshMemory: () => Promise<void>;
  loadHarnesses: () => Promise<void>;
  edgesChanged: (pairs: [string, string][]) => void;

  exportReport: () => Promise<void>;
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

/** Whether a node answers to what the operator typed in the search box. One
 *  definition, so the count in the toolbar and the nodes that light up on the
 *  canvas can never disagree. */
export function matchesSearch(node: CanvasNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (node.type === "agent") {
    return (
      node.data.label.toLowerCase().includes(q) ||
      node.data.harness.toLowerCase().includes(q) ||
      (node.data.role ?? "").toLowerCase().includes(q) ||
      // Then what the agent actually did. Most of what an operator wants to
      // find — a filename, an error, a decision — was never in a label.
      terminals.contains(node.data.nodeId, q)
    );
  }
  if (node.type === "note") return node.data.note.toLowerCase().includes(q) || "note".includes(q);
  if (node.type === "taskboard") return "project card tasks".includes(q);
  return "shared memory".includes(q);
}

/* The part of the window nothing is floating over. The canvas fills the
   window and the title bar, rail, toolbar and command bar sit on top of it,
   so anything centred in the window itself lands under the chrome. */
function freeArea(): { x: number; y: number; w: number; h: number } | null {
  const pane = document.querySelector(".react-flow");
  if (!pane) return null;
  const { width, height } = pane.getBoundingClientRect();
  if (width === 0 || height === 0) return null;
  // The traffic panel is only sometimes there, so it is measured rather than
  // assumed: with it open, the right edge of the free area moves in.
  const dock = document.querySelector(".right-dock");
  const docked = (dock?.childElementCount ?? 0) > 0;
  const right = CHROME.right + (docked ? dock!.getBoundingClientRect().width + GUTTER : 0);
  return {
    x: CHROME.left + GUTTER,
    y: CHROME.top + GUTTER,
    w: Math.max(160, width - CHROME.left - right - GUTTER * 2),
    h: Math.max(160, height - CHROME.top - CHROME.bottom - GUTTER * 2),
  };
}

/** Call-signs for new agents. Launching two Claude agents used to put two
 *  windows called "claude" on the canvas, which made them impossible to tell
 *  apart, to search for, or to name in a prompt. Which CLI each one runs is
 *  on its header tag either way. */
const CALL_SIGNS = [
  "Orion", "Juno", "Vega", "Atlas", "Nova", "Rigel",
  "Lyra", "Mira", "Sol", "Pax", "Echo", "Iris",
];

function nextAgentName(nodes: CanvasNode[], harness: string): string {
  const taken = new Set(
    nodes.filter((n) => n.type === "agent").map((n) => n.data.label)
  );
  const free = CALL_SIGNS.find((name) => !taken.has(name));
  if (free) return free;
  let n = 2;
  while (taken.has(`${harness}-${n}`)) n++;
  return `${harness}-${n}`;
}

/* Where the next agent window goes: two columns, stepped slightly right on
   each new row so a deep canvas still reads as a stack of pairs. */
function agentSlot(nodes: CanvasNode[]): { x: number; y: number } {
  const count = nodes.filter((n) => n.type === "agent").length;
  const col = count % 2;
  const row = Math.floor(count / 2);
  return {
    x: 80 + col * (NODE_SIZE.width + 44) + row * 40,
    y: 70 + row * (NODE_SIZE.height + 44),
  };
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
  officeOpen: false,
  shortcutsOpen: false,
  diagnosticsOpen: false,
  changesFor: null,
  notifications: localStorage.getItem("ac.notifications") !== "0",
  theme: (localStorage.getItem("ac.theme") as Theme) ?? "midnight",
  workspaceRoot: localStorage.getItem("ac.workspaceRoot") ?? "",
  useWorktrees: localStorage.getItem("ac.useWorktrees") === "1",
  memory: [],
  comm: {
    autoComm: true,
    sent: 0,
    cap: 200,
    hiring: true,
    agents: 0,
    agentCap: 8,
    turns: 0,
    turnCap: 120,
    tokens: 0,
    costUsd: 0,
  },
  broadcast: false,
  activity: [],
  activityOpen: false,
  activitySeen: 0,
  history: readHistory(),
  pulses: {},
  resumable: null,
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
      style: { width: NODE_SIZE.width, height: NODE_SIZE.height },
      data: {
        nodeId: info.id,
        label: info.label,
        harness: info.harness,
        cwd: info.cwd,
        status: info.status ?? "idle",
        role: info.role ?? "",
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

  launchAgent: async (harness, label, prompt = "", role = "") => {
    const { workspaceRoot, useWorktrees, nodes } = get();
    if (!workspaceRoot) {
      get().pushToast("err", "Choose a working folder first — the folder button in the toolbar.");
      return null;
    }
    const name = label || nextAgentName(nodes, harness);

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
          style: { width: NODE_SIZE.width, height: NODE_SIZE.height },
          data: {
            nodeId: holder,
            label: name,
            harness,
            cwd: workspaceRoot,
            status: "starting",
            role,
            pending: true,
          },
        } as CanvasNode,
      ],
    }));
    // Show the new window without re-framing the canvas: reframing shrinks
    // every terminal a little more with each launch, and moves the one the
    // operator was reading. `revealNode` only pans, and only if it has to.
    setTimeout(() => get().revealNode(holder), 80);
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
      const info = await api.addAgent({ label: name, harness, cwd, prompt, role });
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

  /** Launch a whole team: every member, then the wires between them.
   *
   *  Members start one at a time on purpose. Each one spawns a process and
   *  writes config, and a CLI that comes up while three others are still
   *  starting is the case where prompts got swallowed. */
  launchTeam: async (team) => {
    const { workspaceRoot, harnesses } = get();
    if (!workspaceRoot) {
      get().pushToast("err", "Choose a working folder first — the folder button in the toolbar.");
      return;
    }
    const installed = harnesses.filter((h) => h.available);
    if (installed.length === 0) {
      get().pushToast("err", noAgentsReason());
      return;
    }

    // A template names the CLI it was written for. If that one is missing,
    // the team still runs — a review pair with two of the same CLI is worth
    // more than an error message.
    const pick = (want: string) =>
      installed.find((h) => h.name === want)?.name ?? installed[0].name;

    const ids: (string | null)[] = [];
    for (const m of team.members) {
      ids.push(await get().launchAgent(pick(m.harness), m.name, m.brief, m.role));
    }

    const started = ids.filter((id): id is string => id !== null);
    if (started.length === 0) {
      get().pushToast("err", `${team.label} did not start.`);
      return;
    }

    let wired = 0;
    for (const [a, b] of team.wires) {
      const from = ids[a];
      const to = ids[b];
      if (!from || !to) continue;
      try {
        await api.addEdge(from, to);
        wired++;
      } catch {
        /* the Bus refused this pair; the others still stand */
      }
    }

    get().frameAll();
    get().pushToast(
      started.length === team.members.length ? "ok" : "err",
      `${team.label}: ${started.length} of ${team.members.length} agents, ${wired} connected.`
    );
  },

  forgetResumable: () => set({ resumable: null }),

  /** Capture what is on the canvas as a team that can be launched again.
   *
   *  Agent processes do not survive a restart, so this is how a canvas the
   *  operator liked comes back: the same roles, wired the same way. */
  teamFromCanvas: (label) => {
    const { nodes, edges } = get();
    const agents = nodes.filter(
      (n): n is import("./types").AgentFlowNode => n.type === "agent" && !n.data.pending
    );
    if (agents.length === 0) return null;

    const index = new Map(agents.map((a, i) => [a.id, i]));
    const wires: [number, number][] = [];
    for (const e of edges) {
      const a = index.get(e.source);
      const b = index.get(e.target);
      if (a !== undefined && b !== undefined) wires.push([a, b]);
    }

    return {
      id: `saved-${Date.now()}`,
      label,
      blurb: `${agents.length} agent${agents.length === 1 ? "" : "s"}, ${wires.length} connection${wires.length === 1 ? "" : "s"}`,
      saved: true,
      members: agents.map((a) => ({
        harness: a.data.harness,
        name: a.data.label,
        role: a.data.role ?? "",
        // Roles were the point of saving this, so relaunching restates them.
        brief: a.data.role
          ? `You are the ${a.data.label} on this canvas. Your role: ${a.data.role}. Do not start work yet. Reply with one line confirming your role, then wait.`
          : "",
      })),
      wires,
    };
  },

  removeNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node?.type === "agent" && !node.data.pending) {
      void api.killAgent(node.data.nodeId).catch(() => undefined);
      terminals.dispose(node.data.nodeId);
      // The worktree stays: it may hold work that was never committed, and
      // deleting an agent is not a request to throw that away. Say where.
      if (node.data.worktree) {
        get().pushToast("ok", `${node.data.label} stopped. Its worktree is still at ${node.data.worktree}`);
      }
    }
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
  },

  /* Also where "the work finished" is detected. Every status change passes
     through here, so the moment the last busy agent goes quiet is exactly the
     transition from some-busy to none-busy — the one thing worth telling
     somebody who has walked away from the window. */
  setStatus: (nodeId, status) => {
    const busy = (map: Record<string, string>) =>
      Object.values(map).filter((v) => v === "running" || v === "waiting").length;
    const before = busy(get().statuses);
    set((s) => ({ statuses: { ...s.statuses, [nodeId]: status } }));
    const after = busy(get().statuses);

    if (before > 0 && after === 0 && get().notifications && away()) {
      const n = get().nodes.filter((x) => x.type === "agent" && !x.data.pending).length;
      void sendDesktopNotification(
        "Agent Canvas",
        n === 1 ? "Your agent has finished." : `All ${n} agents are idle.`
      );
    }
  },

  bumpUnread: (nodeId) =>
    set((s) => {
      if (s.selectedNodeId === nodeId) return s;
      return { unread: { ...s.unread, [nodeId]: (s.unread[nodeId] ?? 0) + 1 } };
    }),

  /* Wipes what every terminal is holding without touching the sessions
     behind them: the agents keep running, their scrollback does not. */
  clearTerminals: () => terminals.clearAll(),

  upsertTask: (t) =>
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.id === t.id);
      if (idx === -1) return { tasks: [...s.tasks, t] };
      const tasks = s.tasks.slice();
      tasks[idx] = { ...tasks[idx], ...t };
      return { tasks };
    }),

  dropTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  /** The board as the Bus has it, in the order it was built. Read once at
   *  startup; after that the `task` events keep it current. */
  refreshTasks: async () => {
    try {
      set({ tasks: await api.listTasks() });
    } catch {
      /* the Bus may not be up yet */
    }
  },

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

  /* Selection is also what the command bar talks to, so picking a window
     takes the bar out of Everyone mode: one idea of "the agent I am on".
     ReactFlow keeps its own `selected` flag per node and that is what draws
     the ring and the resize handles, so selecting from anywhere else — a
     number key, the target picker, a search hit — has to set it too. */
  setSelected: (id) =>
    set((s) => {
      const mark = (nodes: CanvasNode[]) =>
        nodes.some((n) => !!n.selected !== (n.id === id))
          ? nodes.map((n) => ({ ...n, selected: n.id === id }))
          : nodes;
      if (id === null) {
        return s.selectedNodeId === null && s.nodes === mark(s.nodes)
          ? s
          : { selectedNodeId: null, nodes: mark(s.nodes) };
      }
      if (s.selectedNodeId === id) {
        return { nodes: mark(s.nodes), ...(s.broadcast ? { broadcast: false } : {}) };
      }
      return {
        selectedNodeId: id,
        broadcast: false,
        nodes: mark(s.nodes),
        unread: { ...s.unread, [id]: 0 },
      };
    }),

  setZoom: (z) => set({ zoom: Math.round(z) }),
  setSearch: (search) => set({ search }),

  setTint: (t) => {
    localStorage.setItem("ac.tint", String(t));
    set({ tint: t });
  },

  setFocus: (focus) => set({ focus }),
  setOfficeOpen: (officeOpen) => set({ officeOpen }),

  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),

  setChangesFor: (changesFor) => set({ changesFor }),

  setNotifications: (notifications) => {
    localStorage.setItem("ac.notifications", notifications ? "1" : "0");
    set({ notifications });
  },

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
      const box = nodesBox(get().nodes);
      const free = freeArea();
      if (!free || !box || box.width === 0 || box.height === 0) return;

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

  /** Bring one node into view without changing the zoom the operator chose.
   *  A node already fully visible is left exactly where it is: panning the
   *  canvas under someone who can already see the thing is disorienting. */
  revealNode: (id) => {
    const flow = get().flow;
    if (!flow) return;
    const el = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${CSS.escape(id)}"]`
    );
    const node = get().nodes.find((n) => n.id === id);
    const free = freeArea();
    if (!el || !node || !free) return;

    const { zoom, x, y } = flow.getViewport();
    const w = el.offsetWidth * zoom;
    const h = el.offsetHeight * zoom;
    const left = node.position.x * zoom + x;
    const top = node.position.y * zoom + y;

    const inside =
      left >= free.x &&
      top >= free.y &&
      left + w <= free.x + free.w &&
      top + h <= free.y + free.h;
    if (inside) return;

    void flow.setViewport(
      {
        zoom,
        x: free.x + (free.w - w) / 2 - node.position.x * zoom,
        y: free.y + (free.h - h) / 2 - node.position.y * zoom,
      },
      { duration: document.hidden ? 0 : 260 }
    );
  },

  setBroadcast: (broadcast) => set({ broadcast }),

  /** Put the whole canvas down: interrupt every agent that is working and
   *  stop them talking to each other. What the turn budget does when it
   *  trips, and what the operator gets a button for. */
  stopEverything: (why) => {
    const running = Object.entries(get().statuses)
      .filter(([, s]) => s === "running" || s === "waiting")
      .map(([id]) => id);
    running.forEach((id) => void api.interruptAgent(id).catch(() => undefined));
    void api.setAutoComm(false).catch(() => undefined);
    get().pushToast("err", why);
  },

  /** Keep the operator's own copy of a message that crossed a wire. The
   *  agents receive these as typed input; nothing else records them. */
  logMessage: (from, to, text) =>
    set((s) => {
      const next = [...s.activity, { id: ++activitySeq, from, to, text, ts: Date.now() }];
      return {
        activity: next.length > ACTIVITY_MAX ? next.slice(-ACTIVITY_MAX) : next,
        activitySeen: s.activityOpen ? next.length : s.activitySeen,
      };
    }),

  setActivityOpen: (activityOpen) =>
    set((s) => ({
      activityOpen,
      activitySeen: activityOpen ? s.activity.length : s.activitySeen,
      // The panel is where those messages are read, so the badges that were
      // pointing at them have done their job.
      unread: activityOpen ? {} : s.unread,
    })),

  clearActivity: () => set({ activity: [], activitySeen: 0 }),

  pushHistory: (text) =>
    set((s) => {
      const history = [text, ...s.history.filter((h) => h !== text)].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch {
        /* a full or disabled store must not lose the prompt itself */
      }
      return { history };
    }),

  /** The name the operator gave a node, for anything that has only its id. */
  labelOf: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    return node && node.type === "agent" ? node.data.label : id;
  },

  /** Send one prompt to every agent. Returns how many got it.
   *
   *  A busy agent is included: the pty queues a prompt and types it in when
   *  its CLI goes quiet, so skipping busy agents would drop the message for
   *  exactly the agents most likely to be mid-task. */
  promptAll: (text) => {
    const targets = get()
      .nodes.filter((n): n is import("./types").AgentFlowNode => n.type === "agent")
      .filter((n) => !n.data.pending);
    targets.forEach((n) => api.sendPrompt(n.data.nodeId, text).catch(() => undefined));
    return targets.length;
  },

  setComm: (comm) => set({ comm }),


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

  /** Write down what this session did, somewhere the operator can share it.
   *
   *  The transcripts come from the emulators rather than the Bus: the Bus
   *  keeps only the current screen, and a report of a finished session wants
   *  the whole scrollback. */
  exportReport: async () => {
    const s = get();
    const at = Date.now();
    const transcripts: Record<string, string> = {};
    for (const n of s.nodes) {
      if (n.type === "agent" && !n.data.pending) {
        transcripts[n.data.nodeId] = terminals.textOf(n.data.nodeId);
      }
    }

    const markdown = buildReport({
      workspaceRoot: s.workspaceRoot,
      startedAt: SESSION_STARTED,
      endedAt: at,
      nodes: s.nodes,
      edges: s.edges.map((e) => ({ source: e.source, target: e.target })),
      statuses: s.statuses,
      activity: s.activity,
      tasks: s.tasks,
      memory: s.memory,
      transcripts,
    });

    try {
      const path = await save({
        title: "Save the session report",
        defaultPath: reportFilename(s.workspaceRoot, at),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!path) return;
      await api.exportReport(path, markdown);
      get().pushToast("ok", `Report saved to ${path.split("/").pop()}.`);
    } catch (e) {
      get().pushToast("err", `Report not saved — ${String(e)}`);
    }
  },

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

  /* Notes and cards come back as they were. Agents cannot: those were
     processes, and they died with the app. What comes back for them is the
     shape of the team — who, running what, in what role, wired how — offered
     as something to start again rather than started automatically. Relaunching
     four CLIs because someone opened the app would be a rude surprise and a
     real bill. */
  restoreWorkspace: async () => {
    try {
      const raw = await api.loadWorkspace();
      if (!raw) return;
      const file = JSON.parse(raw) as {
        tint?: number;
        nodes?: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
        edges?: { source: string; target: string }[];
      };
      if (typeof file.tint === "number") set({ tint: file.tint });

      const saved = file.nodes ?? [];
      const restorable = saved.filter(
        (n) => n.type === "note" || n.type === "taskboard" || n.type === "memory"
      ) as unknown as CanvasNode[];
      if (restorable.length) {
        set({ nodes: restorable });
        // They were saved wherever the canvas was last panned to, which may be
        // nowhere near the default viewport. Show them.
        get().frameAll();
      }

      const agents = saved.filter((n) => n.type === "agent" && !n.data?.pending);
      if (agents.length === 0) return;
      const index = new Map(agents.map((a, i) => [a.id, i]));
      const wires: [number, number][] = [];
      for (const e of file.edges ?? []) {
        const a = index.get(e.source);
        const b = index.get(e.target);
        if (a !== undefined && b !== undefined) wires.push([a, b]);
      }
      set({
        resumable: {
          id: "resume",
          label: "Last session",
          blurb: `${agents.length} agent${agents.length === 1 ? "" : "s"}, ${wires.length} connection${wires.length === 1 ? "" : "s"}`,
          saved: true,
          members: agents.map((a) => {
            const role = String(a.data?.role ?? "");
            const label = String(a.data?.label ?? "Agent");
            return {
              harness: String(a.data?.harness ?? ""),
              name: label,
              role,
              brief: role
                ? `You are the ${label} on this canvas. Your role: ${role}. Do not start work yet. Reply with one line confirming your role, then wait.`
                : "",
            };
          }),
          wires,
        },
      });
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
