import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import WindowControls, { isWindows } from "./WindowControls";
import * as updates from "../updates";
import type { AgentFlowNode } from "../types";

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const AGENTS = "M17 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8";
const SAVE = "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8";
const LINK = "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7";
const RELOAD = "M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6";
const TRAFFIC = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
const KEYS = "M4 6h16v12H4zM8 10h.01M12 10h.01M16 10h.01M8 14h8";
const REPORT = "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6";

export default function TitleBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const zoom = useStore((s) => s.zoom);
  const nodes = useStore((s) => s.nodes);
  const statuses = useStore((s) => s.statuses);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const pushToast = useStore((s) => s.pushToast);
  const saveWorkspace = useStore((s) => s.saveWorkspace);
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const activityOpen = useStore((s) => s.activityOpen);
  const setActivityOpen = useStore((s) => s.setActivityOpen);
  const unseen = useStore((s) => s.activity.length - s.activitySeen);
  const setShortcutsOpen = useStore((s) => s.setShortcutsOpen);
  const exportReport = useStore((s) => s.exportReport);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const agents = nodes.filter((n): n is AgentFlowNode => n.type === "agent");
  const running = agents.filter((n) =>
    ["running", "waiting"].includes(statuses[n.data.nodeId] ?? "")
  ).length;

  const save = async () => {
    await saveWorkspace();
    pushToast("ok", "Workspace saved.");
  };

  /** `loud` when the operator asked: then even "you are up to date" is worth
   *  saying. The startup check stays quiet unless there is something to get. */
  const checkForUpdate = async (loud: boolean) => {
    const state = await updates.look();
    if (state.kind === "available") {
      pushToast("ok", `Agent Canvas ${state.version} is out. Updating…`);
      try {
        await state.install();
      } catch (e) {
        pushToast("err", `Update failed — ${String(e)}`);
      }
    } else if (loud) {
      pushToast(
        state.kind === "none" ? "ok" : "err",
        state.kind === "none" ? "You are on the latest version." : state.why
      );
    }
  };

  const copyBus = async () => {
    try {
      const bus = await api.getBusInfo();
      await navigator.clipboard.writeText(`http://127.0.0.1:${bus.port} ${bus.token}`);
      pushToast("ok", `Bus address copied — 127.0.0.1:${bus.port}`);
    } catch {
      pushToast("err", "The Bus is not listening yet.");
    }
  };

  return (
    <div className={`titlebar ${isWindows ? "own-frame" : ""}`}>
      <span className="tb-logo" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 1024 1024">
          <g stroke="#4d97ff" strokeWidth="88" strokeLinecap="round" fill="none">
            <path d="M340 368H684" />
            <path d="M340 368V656" />
          </g>
          <rect x="232" y="260" width="216" height="216" rx="34" fill="#2fd45e" />
          <rect x="610" y="302" width="148" height="148" rx="26" fill="#0e1420"
                stroke="#a8bede" strokeWidth="68" />
          <rect x="266" y="582" width="148" height="148" rx="26" fill="#0e1420"
                stroke="#a8bede" strokeWidth="68" />
        </svg>
      </span>
      <span className="tb-name">Agent Canvas</span>
      <span className="tb-workspace" title={workspaceRoot || "No folder chosen yet"}>
        {workspaceRoot ? workspaceRoot.split("/").filter(Boolean).pop() : "no folder yet"}
      </span>
      <div className="tb-spacer" data-tauri-drag-region />
      <div className="tb-cluster">
        <span
          className="tb-btn"
          style={{ cursor: "default" }}
          title={`${agents.length} agent${agents.length === 1 ? "" : "s"}, ${running} working`}
        >
          <Icon d={AGENTS} size={13} />
          {agents.length}
          {running > 0 && <b style={{ color: "var(--live)" }}>·{running}</b>}
        </span>
        <button
          className={`tb-btn ${activityOpen ? "is-on" : ""}`}
          title="What the agents have said to each other (⌘J)"
          onClick={() => setActivityOpen(!activityOpen)}
        >
          <Icon d={TRAFFIC} size={13} /> Traffic
          {unseen > 0 && <span className="tb-count">{unseen}</span>}
        </button>
        <button className="tb-btn" title="Save workspace (⌘S)" onClick={() => void save()}>
          <Icon d={SAVE} size={13} /> Save
        </button>
        <button className="tb-btn" title="Copy the Bus address" onClick={() => void copyBus()}>
          <Icon d={LINK} size={13} /> Bus
        </button>
        <div className="rail-wrap" ref={menuRef}>
          <button className="tb-btn" title="More" onClick={() => setMenuOpen(!menuOpen)}>
            ···
          </button>
          {menuOpen && (
            <div className="rail-menu" style={{ top: 30, left: "auto", right: 0 }}>
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void checkForUpdate(true);
                }}
              >
                <span>Check for updates…</span>
                <Icon d={RELOAD} size={12} />
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void exportReport();
                }}
              >
                <span>Export session report…</span>
                <Icon d={REPORT} size={12} />
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setShortcutsOpen(true);
                }}
              >
                <span>Keyboard shortcuts</span>
                <Icon d={KEYS} size={12} />
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => window.location.reload()}>
                <span>Reload the canvas</span>
                <Icon d={RELOAD} size={12} />
              </button>
            </div>
          )}
        </div>
        <button
          className="tb-pill"
          title="Hide the rail, toolbar and minimap"
          onClick={() => setFocus(!focus)}
          style={
            focus
              ? { background: "rgba(61,139,253,0.26)", borderColor: "rgba(61,139,253,0.5)" }
              : undefined
          }
        >
          Focus
        </button>
        <span className="tb-btn tb-zoom">{zoom}%</span>
        {!isWindows && <span className="tb-avatar" />}
        <WindowControls />
      </div>
    </div>
  );
}
