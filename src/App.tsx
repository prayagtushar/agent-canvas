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
import Diagnostics from "./components/Diagnostics";
import CommChips from "./components/CommChips";
import Activity from "./components/Activity";
import Approvals from "./Approvals";
import { api } from "./api";
import { useStore } from "./store";
import * as terminals from "./terminals";
import * as notify from "./notify";
import type { BusEvent } from "./types";

export default function App() {
  const tint = useStore((s) => s.tint);
  const focus = useStore((s) => s.focus);
  const theme = useStore((s) => s.theme);
  // Anything in the right-hand dock: other right-edge chrome steps aside.
  const docked = useStore(
    (s) => s.activityOpen || s.approvals.some((a) => a.answer === null)
  );

  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    let disposed = false;

    const register = async () => {
      // Raw pty bytes. They go to the emulator rather than through the
      // store: the terminal owns its own scrollback and already coalesces
      // writes onto an animation frame, so putting React in the middle would
      // only re-render a node that repaints itself anyway.
      const offOutput = await listen<{ nodeId: string; chunk: string }>(
        "agent-output",
        ({ payload }) => terminals.write(payload.nodeId, payload.chunk)
      );
      const offStatus = await listen<{ nodeId: string; status: string }>(
        "agent-status",
        ({ payload }) => {
          const st = useStore.getState();
          st.setStatus(payload.nodeId, payload.status);
          if (payload.status === "error") {
            const name = st.labelOf(payload.nodeId);
            st.pushToast("err", `${name} stopped with an error. Check its output.`);
            if (st.notifications && notify.away()) {
              void notify.notify("Agent Canvas", `${name} stopped with an error.`);
            }
          }
        }
      );
      const offBus = await listen<BusEvent>("bus-event", ({ payload }) => {
        const st = useStore.getState();
        switch (payload.kind) {
          case "message":
            // The recipient is a full-screen TUI: there is nowhere to slip a
            // line of our own into its display without corrupting it. The
            // badge, the bead on the wire and the activity panel carry the
            // news instead.
            st.bumpUnread(payload.to);
            st.pulseWire(payload.from, payload.to);
            st.logMessage(payload.from, payload.to, payload.text);
            break;
          case "task":
            if (payload.action === "removed") st.dropTask(payload.task.id);
            else st.upsertTask(payload.task);
            break;
          case "approval":
            st.upsertApproval(payload.approval);
            if (payload.approval.answer === null && st.notifications && notify.away()) {
              void notify.notify(
                `${st.labelOf(payload.approval.fromNode)} needs your decision`,
                payload.approval.question
              );
            }
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
          case "node": {
            // An agent one of the agents started. Nothing on the canvas asked
            // for it, so it has to be placed, shown, and named out loud.
            const id = st.addAgentCanvasNode(payload.node);
            st.revealNode(id);
            st.pushToast(
              "ok",
              `${payload.node.label} was started by another agent.`
            );
            break;
          }
          case "notice": {
            st.pushToast("err", `${st.labelOf(payload.node)}: ${payload.text}`);
            break;
          }
        }
      });
      if (disposed) {
        offOutput();
        offStatus();
        offBus();
      } else {
        unlisteners.push(offOutput, offStatus, offBus);
      }
    };
    void register();

    const st = useStore.getState();
    void st.loadHarnesses();
    void st.restoreWorkspace();
    void st.refreshMemory();
    void st.refreshTasks();
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
    terminals.syncTheme();
  }, [theme]);

  useEffect(() => {
    /** Agents in the order they were launched, which is the order the number
     *  keys address them in and the order ⌘[ / ⌘] walk. */
    const agentIds = () =>
      useStore
        .getState()
        .nodes.filter((n) => n.type === "agent" && !n.data.pending)
        .map((n) => n.id);

    /** Select the nth agent, bring it on screen, and put the caret in its
     *  terminal so the next keystroke goes to the CLI, not the canvas. */
    const select = (index: number) => {
      const ids = agentIds();
      const id = ids[index];
      if (!id) return;
      const st = useStore.getState();
      st.setSelected(id);
      st.revealNode(id);
      terminals.focus(id);
    };

    const step = (delta: number) => {
      const ids = agentIds();
      if (ids.length === 0) return;
      const at = ids.indexOf(useStore.getState().selectedNodeId ?? "");
      // Nothing selected yet: ⌘] starts at the first agent, ⌘[ at the last.
      if (at === -1) select(delta > 0 ? 0 : ids.length - 1);
      else select((at + delta + ids.length) % ids.length);
    };

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
        // The same set the Stop button acts on: an agent waiting on its own
        // prompt is as much "running" to the operator as one mid-turn.
        const running = Object.entries(st.statuses)
          .filter(([, s]) => s === "running" || s === "waiting")
          .map(([id]) => id);
        running.forEach((id) => void api.interruptAgent(id).catch(() => undefined));
        st.pushToast("ok", running.length ? `Interrupted ${running.length}.` : "Nothing is running.");
      } else if (meta && e.key === "\\") {
        e.preventDefault();
        st.setFocus(!st.focus);
      } else if (meta && e.key === "0") {
        e.preventDefault();
        st.frameAll();
      } else if (meta && e.key === "j") {
        e.preventDefault();
        st.setActivityOpen(!st.activityOpen);
      } else if (meta && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        step(e.key === "]" ? 1 : -1);
      } else if (meta && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        select(Number(e.key) - 1);
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
      className={`shell ${focus ? "focus" : ""} ${docked ? "has-dock" : ""}`}
      data-theme={theme}
      style={{ ["--tint" as string]: String(tint) }}
    >
      <Canvas />
      <Toolbar />
      <CommandBar />
      <TitleBar />
      <Rail />
      <CommChips />
      {/* One column down the right-hand edge. An approval is an interruption
          the operator must answer, so it sits above the traffic they chose to
          open, and the two can never land on top of each other. */}
      <div className="right-dock">
        <Approvals />
        <Activity />
      </div>
      <Toasts />
      <Shortcuts />
      <Diagnostics />
    </div>
    </ReactFlowProvider>
  );
}
