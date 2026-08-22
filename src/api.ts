import { invoke } from "@tauri-apps/api/core";
import type { BusInfo, HarnessInfo, MemoryEntry, NodeInfo } from "./types";

export type AddAgentArgs = {
  label: string;
  harness: string;
  cwd: string;
  prompt: string;
};

export const api = {
  addAgent: (args: AddAgentArgs): Promise<NodeInfo | null> =>
    invoke<NodeInfo | null>("add_agent", args),

  sendPrompt: (id: string, text: string): Promise<void> =>
    invoke<void>("send_prompt", { id, text }),

  interruptAgent: (id: string): Promise<void> =>
    invoke<void>("interrupt_agent", { id }),

  killAgent: (id: string): Promise<void> => invoke<void>("kill_agent", { id }),

  listHarnesses: (): Promise<HarnessInfo[]> => invoke<HarnessInfo[]>("list_harnesses"),

  saveWorkspace: (json: string): Promise<void> => invoke<void>("save_workspace", { json }),

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

  listMemory: (): Promise<MemoryEntry[]> => invoke<MemoryEntry[]>("list_memory"),

  remember: (key: string, value: string): Promise<MemoryEntry> =>
    invoke<MemoryEntry>("remember", { key, value }),

  forgetMemory: (key: string): Promise<void> => invoke<void>("forget_memory", { key }),
};