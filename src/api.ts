import { invoke } from "@tauri-apps/api/core";
import type {
  BusInfo,
  CommState,
  HarnessDiagnosis,
  HarnessInfo,
  MemoryEntry,
  NodeInfo,
  Task,
} from "./types";

/** Whether a Tauri backend is answering at all.
 *
 *  False in a plain browser, where `bun run dev` serves the interface for
 *  design work but nothing behind it exists: a tab cannot spawn a process,
 *  so every command in this file throws. Worth knowing, because the failure
 *  otherwise looks exactly like having no CLIs installed. */
export function hasBackend(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Why nothing can start, said accurately.
 *
 *  Telling someone with all four CLIs installed to go install them sends
 *  them off to fix the wrong thing. */
export function noAgentsReason(): string {
  return hasBackend()
    ? "No agent CLIs found on your PATH."
    : "Agents only run in the desktop app. This is the browser preview.";
}

export type AddAgentArgs = {
  label: string;
  harness: string;
  cwd: string;
  prompt: string;
  /** What this agent is for. Stored on the Bus, so peers see it too. */
  role: string;
};

export const api = {
  addAgent: (args: AddAgentArgs): Promise<NodeInfo | null> =>
    invoke<NodeInfo | null>("add_agent", args),

  sendPrompt: (id: string, text: string): Promise<void> =>
    invoke<void>("send_prompt", { id, text }),

  interruptAgent: (id: string): Promise<void> =>
    invoke<void>("interrupt_agent", { id }),

  killAgent: (id: string): Promise<void> => invoke<void>("kill_agent", { id }),

  restartAgent: (id: string): Promise<void> => invoke<void>("restart_agent", { id }),

  /** Rename an agent on the Bus, which is also what its peers see. Returns
   *  the name that was actually stored, after trimming and truncation. */
  renameAgent: (id: string, label: string): Promise<string> =>
    invoke<string>("rename_agent", { id, label }),

  /** Keystrokes from a node's terminal, straight through to the CLI. */
  agentInput: (id: string, data: string): Promise<void> =>
    invoke<void>("agent_input", { id, data }),

  agentResize: (id: string, cols: number, rows: number): Promise<void> =>
    invoke<void>("agent_resize", { id, cols, rows }),

  listHarnesses: (): Promise<HarnessInfo[]> => invoke<HarnessInfo[]>("list_harnesses"),

  /** Installed CLIs, their versions, and how each is wired to the Bus. */
  diagnoseHarnesses: (): Promise<HarnessDiagnosis[]> =>
    invoke<HarnessDiagnosis[]>("diagnose_harnesses"),

  saveWorkspace: (json: string): Promise<void> => invoke<void>("save_workspace", { json }),

  /** Write a session report to a path the operator picked. */
  exportReport: (path: string, contents: string): Promise<void> =>
    invoke<void>("export_report", { path, contents }),

  loadWorkspace: (): Promise<string | null> => invoke<string | null>("load_workspace"),

  answerApproval: (id: string, answer: string): Promise<void> =>
    invoke<void>("answer_approval", { id, answer }),

  getBusInfo: (): Promise<BusInfo> => invoke<BusInfo>("get_bus_info"),

  addEdge: (a: string, b: string): Promise<void> => invoke<void>("add_edge", { a, b }),

  removeEdge: (a: string, b: string): Promise<void> => invoke<void>("remove_edge", { a, b }),

  defaultWorkspaceRoot: (): Promise<string> => invoke<string>("default_workspace_root"),

  isGitRepo: (path: string): Promise<boolean> => invoke<boolean>("is_git_repo", { path }),

  createWorktree: (repo: string, name: string): Promise<string> =>
    invoke<string>("create_worktree", { repo, name }),

  removeWorktree: (repo: string, path: string): Promise<void> =>
    invoke<void>("remove_worktree", { repo, path }),

  /** What one agent has changed in the folder it works in. */
  agentDiff: (id: string): Promise<string> => invoke<string>("agent_diff", { id }),

  getCommState: (): Promise<CommState> => invoke<CommState>("get_comm_state"),

  setAutoComm: (on: boolean): Promise<void> => invoke<void>("set_auto_comm", { on }),

  /** Whether an agent may start another agent. */
  setAllowHiring: (on: boolean): Promise<void> =>
    invoke<void>("set_allow_hiring", { on }),

  setMessageCap: (cap: number): Promise<void> => invoke<void>("set_message_cap", { cap }),

  /** Raise or lower how many turns the canvas may take before it stops. */
  setTurnCap: (cap: number): Promise<void> => invoke<void>("set_turn_cap", { cap }),

  resetMessageCount: (): Promise<void> => invoke<void>("reset_message_count"),

  listMemory: (): Promise<MemoryEntry[]> => invoke<MemoryEntry[]>("list_memory"),

  listTasks: (): Promise<Task[]> => invoke<Task[]>("list_tasks"),

  /** Every node the Bus knows about, with its counters. */
  listNodes: (): Promise<NodeInfo[]> => invoke<NodeInfo[]>("list_nodes"),

  /** Put work on the shared board as the operator. */
  addTask: (title: string, details: string): Promise<Task> =>
    invoke<Task>("add_task", { title, details }),

  removeTask: (id: string): Promise<void> => invoke<void>("remove_task", { id }),

  remember: (key: string, value: string): Promise<MemoryEntry> =>
    invoke<MemoryEntry>("remember", { key, value }),

  forgetMemory: (key: string): Promise<void> => invoke<void>("forget_memory", { key }),
};