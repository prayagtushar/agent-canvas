import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
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

export default function TitleBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const zoom = useStore((s) => s.zoom);
  const nodes = useStore((s) => s.nodes);
  const statuses = useStore((s) => s.statuses);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const pushToast = useStore((s) => s.pushToast);
  const clearOutputs = useStore((s) => s.clearOutputs);
  const saveWorkspace = useStore((s) => s.saveWorkspace);

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
    <div className="titlebar">
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
      <span className="tb-workspace">untitled workspace</span>
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
                  clearOutputs();
                  setMenuOpen(false);
                  pushToast("ok", "Output cleared.");
                }}
              >
                Clear all output
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
        <span className="tb-avatar" />
      </div>
    </div>
  );
}
