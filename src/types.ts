import type { Node } from "@xyflow/react";

export type HarnessStatus = "idle" | "running" | "waiting" | "exited" | "error";

export interface NodeInfo {
  id: string;
  label: string;
  harness: string;
  cwd: string;
  status: string;
  /** What this agent is for. Peers read it out of `list_peers`. */
  role?: string;
  output_tail: string[];
  unread: number;
}

/** One agent in a team template. */
export interface TeamMember {
  /** Preferred CLI. Falls back to whatever is installed. */
  harness: string;
  name: string;
  /** A few words, shown on the node and handed to peers. */
  role: string;
  /** Typed into the CLI once it comes up. */
  brief: string;
}

/** A set of agents, their roles, and the wires between them. */
export interface Team {
  id: string;
  label: string;
  blurb: string;
  members: TeamMember[];
  /** Pairs of indices into `members`. */
  wires: [number, number][];
  /** Set on teams the operator saved off their own canvas. */
  saved?: boolean;
}

export interface Task {
  id: string;
  title: string;
  details: string;
  status: "todo" | "claimed" | "done";
  owner: string | null;
  result: string;
  /** The order it was added in. The board reads in this order. */
  seq?: number;
}

export interface Approval {
  id: string;
  fromNode: string;
  question: string;
  answer: string | null;
}

/** One message that travelled a wire. The agents themselves see these as
 *  text typed into their terminals; this is the operator's copy. */
export interface Activity {
  id: number;
  from: string;
  to: string;
  text: string;
  ts: number;
}

export interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
  /** Set for the moment between dismissal and removal, to animate out. */
  leaving?: boolean;
}

export interface HarnessInfo {
  name: string;
  /** Display name, e.g. "Claude Code" for `claude`. */
  label: string;
  /** Found on PATH. */
  available: boolean;
  /** Whether this CLI can be wired to the Bus (peers, tasks, memory). */
  bus: boolean;
}

/** One row of the diagnostics sheet. */
export interface HarnessDiagnosis {
  name: string;
  label: string;
  installed: boolean;
  /** First line of `<cli> --version`, empty if it did not answer. */
  version: string;
  path: string;
  bus: boolean;
  /** How the Bus reaches this CLI, in the operator's words. */
  wiring: string;
}

export interface CommState {
  autoComm: boolean;
  sent: number;
  cap: number;
  /** Whether an agent may start another agent. */
  hiring: boolean;
  /** Agents on the canvas now, and the most allowed at once. */
  agents: number;
  agentCap: number;
}

export interface MemoryEntry {
  key: string;
  value: string;
  author: string;
  ts: number;
}

export interface BusInfo {
  port: number;
  token: string;
}

export type Theme =
  | "midnight"
  | "tokyo-night"
  | "dracula"
  | "nord"
  | "catppuccin"
  | "gruvbox"
  | "one-dark"
  | "rose-pine"
  | "solarized"
  | "ink";

export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: "midnight", label: "Midnight", swatch: "#3d8bfd" },
  { id: "tokyo-night", label: "Tokyo Night", swatch: "#7aa2f7" },
  { id: "dracula", label: "Dracula", swatch: "#bd93f9" },
  { id: "nord", label: "Nord", swatch: "#88c0d0" },
  { id: "catppuccin", label: "Catppuccin", swatch: "#89b4fa" },
  { id: "gruvbox", label: "Gruvbox", swatch: "#b8bb26" },
  { id: "one-dark", label: "One Dark", swatch: "#61afef" },
  { id: "rose-pine", label: "Rosé Pine", swatch: "#c4a7e7" },
  { id: "solarized", label: "Solarized", swatch: "#268bd2" },
  { id: "ink", label: "Ink", swatch: "#6e8cff" },
];

export type BusEvent =
  | { kind: "message"; from: string; to: string; text: string }
  | {
      kind: "task";
      action: "added" | "claimed" | "done" | "removed";
      task: Task;
      by?: string;
    }
  | { kind: "approval"; approval: Approval }
  | { kind: "edges"; edges: [string, string][] }
  | { kind: "memory"; memory: MemoryEntry[] }
  | { kind: "comm"; comm: CommState }
  | { kind: "notice"; node: string; text: string }
  /** An agent another agent started. The canvas did not launch it, so this
   *  is the only way it learns the node exists. */
  | { kind: "node"; node: NodeInfo };

export type AgentData = {
  nodeId: string;
  label: string;
  harness: string;
  cwd: string;
  status: string;
  /** What this agent is for, if it was launched with a role. */
  role?: string;
  /** Set when this agent runs in its own git worktree. */
  worktree?: string;
  /** A stand-in shown while the process starts. Has no Bus node behind it. */
  pending?: boolean;
};

export type TaskBoardData = Record<string, never>;

export type NoteData = {
  note: string;
  label: string;
};

export type MemoryData = Record<string, never>;

export type AgentFlowNode = Node<AgentData, "agent">;
export type TaskBoardFlowNode = Node<TaskBoardData, "taskboard">;
export type NoteFlowNode = Node<NoteData, "note">;
export type MemoryFlowNode = Node<MemoryData, "memory">;

export type CanvasNode =
  | AgentFlowNode
  | TaskBoardFlowNode
  | NoteFlowNode
  | MemoryFlowNode;

export interface WorkspaceFile {
  nodes: { id: string; type: string; position: { x: number; y: number }; data: unknown }[];
  edges: { source: string; target: string }[];
}
