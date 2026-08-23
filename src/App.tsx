import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { ReactFlowProvider } from "@xyflow/react";
import Canvas from "./components/Canvas";
import Toolbar from "./components/Toolbar";
import CommandBar from "./components/CommandBar";
import TitleBar from "./components/TitleBar";
import Rail from "./components/Rail";
import Toasts from "./components/Toasts";
import Shortcuts from "./components/Shortcuts";
import CommChips from "./components/CommChips";
import Approvals from "./Approvals";
import { api } from "./api";
import { useStore } from "./store";
import type { BusEvent } from "./types";

export default function App() {
  const tint = useStore((s) => s.tint);
  const focus = useStore((s) => s.focus);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    let disposed = false;

    const register = async () => {
      const offOutput = await listen<{ nodeId: string; chunk: string }>(
        "agent-output",
        ({ payload }) => useStore.getState().appendOutput(payload.nodeId, payload.chunk)
      );
      const offStatus = await listen<{ nodeId: string; status: string }>(
        "agent-status",
        ({ payload }) => {
          const st = useStore.getState();
          st.setStatus(payload.nodeId, payload.status);
          if (payload.status === "error") {
            const node = st.nodes.find((n) => n.id === payload.nodeId);
            const name = node && node.type === "agent" ? node.data.label : payload.nodeId;
            st.pushToast("err", `${name} stopped with an error. Check its output.`);
          }
        }
      );
      const offUsage = await listen<{
        nodeId: string;
        tokensIn: number;
        tokensOut: number;
        costUsd: number;
      }>("agent-usage", ({ payload }) => {
        useStore.getState().addUsage(payload.nodeId, {
          tokensIn: payload.tokensIn,
          tokensOut: payload.tokensOut,
          costUsd: payload.costUsd,
        });
      });
      const offBus = await listen<BusEvent>("bus-event", ({ payload }) => {
        const st = useStore.getState();
        switch (payload.kind) {
          case "message":
            st.appendOutput(payload.to, `\n[message from ${payload.from}] ${payload.text}\n`);
            st.bumpUnread(payload.to);
            break;
          case "task":
            st.upsertTask(payload.task);
            break;
          case "approval":
            st.upsertApproval(payload.approval);
            break;
          case "edges":
            st.edgesChanged(payload.edges);
            break;
          case "memory":
            st.setMemory(payload.memory);
            break;
          case "comm":
            st.setComm(payload.comm);
            break;
        }
      });
      if (disposed) {
        offOutput();
        offStatus();
        offUsage();
        offBus();
      } else {
        unlisteners.push(offOutput, offStatus, offUsage, offBus);
      }
    };
    void register();

    const st = useStore.getState();
    void st.loadHarnesses();
    void st.restoreWorkspace();
    void st.refreshMemory();
    void st.refreshComm();
    // First run: default the working folder to the user's home directory.
    if (!st.workspaceRoot) {
      void api
        .defaultWorkspaceRoot()
        .then((root) => useStore.getState().setWorkspaceRoot(root))
        .catch(() => undefined);
    }

    return () => {
      disposed = true;
      unlisteners.forEach((off) => off());
    };
  }, []);

  // Persist layout a beat after it settles. Only layout — streaming output
  // changes the store constantly and must not keep resetting the timer.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastNodes = useStore.getState().nodes;
    let lastEdges = useStore.getState().edges;
    const unsub = useStore.subscribe((s) => {
      if (s.nodes === lastNodes && s.edges === lastEdges) return;
      lastNodes = s.nodes;
      lastEdges = s.edges;
      clearTimeout(timer);
      timer = setTimeout(() => void useStore.getState().saveWorkspace(true), 1200);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const st = useStore.getState();
      const typing =
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(e.target.tagName);

      if (meta && e.key === "k") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".cmd-input")?.focus();
      } else if (meta && e.key === "s") {
        e.preventDefault();
        void st.saveWorkspace();
        st.pushToast("ok", "Workspace saved.");
      } else if (meta && e.key === "f") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>(".tool-seg-search")?.click();
      } else if (meta && e.key === ".") {
        e.preventDefault();
        const running = Object.entries(st.statuses)
          .filter(([, s]) => s === "running")
          .map(([id]) => id);
        running.forEach((id) => void api.interruptAgent(id).catch(() => undefined));
        st.pushToast("ok", running.length ? `Interrupted ${running.length}.` : "Nothing is running.");
      } else if (meta && e.key === "\\") {
        e.preventDefault();
        st.setFocus(!st.focus);
      } else if (e.key === "?" && !typing) {
        e.preventDefault();
        st.setShortcutsOpen(!st.shortcutsOpen);
      } else if (e.key === "Escape") {
        st.setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ReactFlowProvider>
    <div
      className={`shell ${focus ? "focus" : ""}`}
      data-theme={theme}
      style={{ ["--tint" as string]: String(tint) }}
    >
      <Canvas />
      <Toolbar />
      <CommandBar />
      <TitleBar />
      <Rail />
      <CommChips />
      <Approvals />
      <Toasts />
      <Shortcuts />
    </div>
    </ReactFlowProvider>
  );
}
