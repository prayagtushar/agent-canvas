import type { Node } from "@xyflow/react";

export type HarnessStatus = "idle" | "running" | "waiting" | "exited" | "error";

export interface NodeInfo {
  id: string;
  label: string;
  harness: string;
  cwd: string;
  status: string;
  output_tail: string[];
  unread: number;
}

export interface Task {
  id: string;
  title: string;
  details: string;
  status: "todo" | "claimed" | "done";
  owner: string | null;
  result: string;
}

export interface Approval {
  id: string;
  fromNode: string;
  question: string;
  answer: string | null;
}

export interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
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

export interface CommState {
  autoComm: boolean;
  sent: number;
  cap: number;
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

export type Theme = "midnight" | "slate" | "ink" | "aurora";

export type BusEvent =
  | { kind: "message"; from: string; to: string; text: string }
  | { kind: "task"; action: "added" | "claimed" | "done"; task: Task; by?: string }
  | { kind: "approval"; approval: Approval }
  | { kind: "edges"; edges: [string, string][] }
  | { kind: "memory"; memory: MemoryEntry[] }
  | { kind: "comm"; comm: CommState };

export type AgentData = {
  nodeId: string;
  label: string;
  harness: string;
  cwd: string;
  status: string;
  /** Set when this agent runs in its own git worktree. */
  worktree?: string;
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
