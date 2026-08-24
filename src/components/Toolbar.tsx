import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { matchesSearch, useStore } from "../store";
import { THEMES } from "../types";
import type { AgentFlowNode } from "../types";

function Icon({ d, size = 13 }: { d: string; size?: number }) {
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

const FOLDER = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const SEARCH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3";
const CLEAR = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM6.3 6.3l11.4 11.4";
const STOP = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9 9h6v6H9z";
const GEAR = "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";
const WALL = "M12 3a9 9 0 1 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1-.3-.3-.4-.6-.4-1 0-.9.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z";
const FIT = "M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3";

export default function Toolbar() {
  const [menu, setMenu] = useState<"settings" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Which match Enter last walked to. */
  const [hit, setHit] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const { zoomIn, zoomOut } = useReactFlow();

  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const clearTerminals = useStore((s) => s.clearTerminals);
  const nodes = useStore((s) => s.nodes);
  const statuses = useStore((s) => s.statuses);
  const zoom = useStore((s) => s.zoom);
  const tint = useStore((s) => s.tint);
  const setTint = useStore((s) => s.setTint);
  const pushToast = useStore((s) => s.pushToast);
  const frameAll = useStore((s) => s.frameAll);
  const revealNode = useStore((s) => s.revealNode);
  const setSelected = useStore((s) => s.setSelected);
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const setWorkspaceRoot = useStore((s) => s.setWorkspaceRoot);
  const comm = useStore((s) => s.comm);
  const notifications = useStore((s) => s.notifications);
  const setNotifications = useStore((s) => s.setNotifications);
  const useWorktrees = useStore((s) => s.useWorktrees);
  const setUseWorktrees = useStore((s) => s.setUseWorktrees);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const hits = search.trim() ? nodes.filter((n) => matchesSearch(n, search)) : [];

  const runningIds = nodes
    .filter((n): n is AgentFlowNode => n.type === "agent")
    .filter((n) => ["running", "waiting"].includes(statuses[n.data.nodeId] ?? ""))
    .map((n) => n.data.nodeId);

  const stopAll = () => {
    if (runningIds.length === 0) {
      pushToast("ok", "Nothing is running.");
      return;
    }
    runningIds.forEach((id) => void api.interruptAgent(id));
    pushToast("ok", `Interrupted ${runningIds.length}.`);
    setMenu(null);
  };

  const workspaceName = workspaceRoot
    ? workspaceRoot.split("/").filter(Boolean).pop() ?? workspaceRoot
    : "Choose a folder";

  const chooseFolder = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Choose the folder agents work in",
        defaultPath: workspaceRoot || (await api.defaultWorkspaceRoot()),
      });
      if (typeof picked === "string") {
        setWorkspaceRoot(picked);
        pushToast("ok", `Agents will run in ${picked.split("/").pop()}.`);
      }
    } catch (e) {
      pushToast("err", `Could not open the folder picker — ${String(e)}`);
    }
  };

  return (
    <div className="toolbar-panel">
      <div className="toolbar" ref={rootRef}>
        <button
          className={`tool-seg seg-folder ${workspaceRoot ? "" : "needs-attention"}`}
          title={workspaceRoot || "No folder chosen yet"}
          onClick={() => void chooseFolder()}
        >
          <Icon d={FOLDER} /> <span className="seg-trunc">{workspaceName}</span>
        </button>

        {searchOpen ? (
          <span className="tool-seg active">
            <Icon d={SEARCH} />
            <input
              autoFocus
              className="tool-search-input"
              placeholder="Find an agent or note"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHit(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  setSearchOpen(false);
                } else if (e.key === "Enter" && hits.length > 0) {
                  // Enter walks the matches; the canvas moves to each in turn
                  // rather than leaving the operator to find the lit-up node.
                  const next = (hit + (e.shiftKey ? hits.length - 1 : 1)) % hits.length;
                  setHit(next);
                  revealNode(hits[next].id);
                  setSelected(hits[next].id);
                }
              }}
              onBlur={() => {
                if (!search) setSearchOpen(false);
              }}
            />
            {search && (
              <span className="search-count">
                {hits.length ? `${hit + 1}/${hits.length}` : "none"}
              </span>
            )}
          </span>
        ) : (
          <button className="tool-seg tool-seg-search" onClick={() => setSearchOpen(true)}>
            <Icon d={SEARCH} /> Search
          </button>
        )}

        <button
          className="tool-seg"
          title="Clear all output"
          onClick={() => {
            clearTerminals();
            pushToast("ok", "Output cleared.");
          }}
        >
          <Icon d={CLEAR} /> Clear
        </button>

        <div className="tool-div" />

        <button
          className="tool-seg"
          title="Fit everything on screen (⌘0)"
          aria-label="Fit everything on screen"
          onClick={frameAll}
        >
          <Icon d={FIT} />
        </button>
        <button
          className="tool-seg tool-seg-zoom"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => void zoomOut({ duration: 150 })}
        >
          −
        </button>
        <span className="tool-seg zoom-val">{zoom}%</span>
        <button
          className="tool-seg tool-seg-zoom"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => void zoomIn({ duration: 150 })}
        >
          +
        </button>

        <div className="tool-div" />

        {/* How much of the desktop wallpaper reads through the canvas. */}
        <span className="tool-seg seg-tint" style={{ cursor: "default" }} title="How much of your wallpaper shows through">
          <Icon d={WALL} />
          <input
            className="tint-range"
            type="range"
            min={0.08}
            max={0.9}
            step={0.02}
            value={tint}
            aria-label="Wallpaper tint"
            onChange={(e) => setTint(Number(e.target.value))}
          />
        </span>

        <button
          className="tool-seg"
          title={runningIds.length ? `Interrupt ${runningIds.length}` : "Nothing is running"}
          onClick={stopAll}
        >
          <Icon d={STOP} /> Stop
        </button>

        <button
          className={`tool-seg ${menu === "settings" ? "active" : ""}`}
          title="Settings"
          onClick={() => setMenu(menu === "settings" ? null : "settings")}
        >
          <Icon d={GEAR} />
        </button>
        {menu === "settings" && (
          <div className="tool-menu" style={{ left: "auto", right: 0, minWidth: 232 }}>
            <div className="menu-head">Isolation</div>
            <button className="menu-item" onClick={() => setUseWorktrees(!useWorktrees)}>
              <span>Own git worktree per agent</span>
              <span className={`switch ${useWorktrees ? "on" : ""}`} />
            </button>
            <div className="menu-sep" />
            <div className="menu-head">What agents may do alone</div>
            <button
              className="menu-item"
              title={`An orchestrator can start its own peers, up to ${comm.agentCap} agents on the canvas`}
              onClick={() => {
                void api.setAllowHiring(!comm.hiring).catch((e) => pushToast("err", String(e)));
              }}
            >
              <span>Start other agents</span>
              <span className={`switch ${comm.hiring ? "on" : ""}`} />
            </button>
            <div className="menu-sep" />
            <div className="menu-head">While you are away</div>
            <button
              className="menu-item"
              title="A desktop notification when an agent needs you, or when the work is done"
              onClick={() => setNotifications(!notifications)}
            >
              <span>Notify me</span>
              <span className={`switch ${notifications ? "on" : ""}`} />
            </button>
            <div className="menu-sep" />
            <div className="menu-head">Theme</div>
            <div className="theme-list nowheel">
              {THEMES.map((t) => (
                <button key={t.id} className="menu-item" onClick={() => setTheme(t.id)}>
                  <span className="theme-name">
                    <span className="theme-swatch" style={{ background: t.swatch }} />
                    {t.label}
                  </span>
                  {theme === t.id && <span className="tick">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
