import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useStore } from "../store";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
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

const PLUS = "M12 5v14M5 12h14";
const BOARD = "M3 5h18v14H3zM8 5v14M16 5v14";
const NOTE = "M4 4h16v12l-4 4H4zM16 20v-4h4";
const MEM = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v4l3 2";
const INFO = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01";

export default function Rail() {
  const [menu, setMenu] = useState<"agent" | "bus" | null>(null);
  const harnesses = useStore((s) => s.harnesses);
  const launchAgent = useStore((s) => s.launchAgent);
  const addTaskBoard = useStore((s) => s.addTaskBoard);
  const addNote = useStore((s) => s.addNote);
  const addMemoryNode = useStore((s) => s.addMemoryNode);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div className="rail" ref={wrapRef}>
      <div className="rail-wrap">
        <button
          className={`rail-btn ${menu === "agent" ? "on" : ""}`}
          title="Launch an agent"
          onClick={() => setMenu(menu === "agent" ? null : "agent")}
        >
          <Icon d={PLUS} />
        </button>
        {menu === "agent" && (
          <div className="rail-menu">
            <div className="menu-head">Launch a harness</div>
            {harnesses.map((h) => (
              <button
                key={h.name}
                className="menu-item"
                disabled={!h.available}
                title={h.available ? undefined : `${h.name} is not on your PATH`}
                onClick={() => {
                  void launchAgent(h.name);
                  setMenu(null);
                }}
              >
                <span>{h.label}</span>
                {!h.available ? (
                  <span className="muted small">not installed</span>
                ) : (
                  !h.bus && <span className="muted small">no bus</span>
                )}
              </button>
            ))}
            {harnesses.length === 0 && (
              <div className="menu-item muted">No harnesses found on PATH</div>
            )}
          </div>
        )}
      </div>

      <div className="rail-wrap">
        <button className="rail-btn" title="Add the project card" onClick={addTaskBoard}>
          <Icon d={BOARD} size={15} />
        </button>
      </div>

      <div className="rail-wrap">
        <button className="rail-btn" title="Add a sticky note" onClick={() => addNote()}>
          <Icon d={NOTE} size={15} />
        </button>
      </div>

      <div className="rail-wrap">
        <button className="rail-btn" title="Show shared memory" onClick={addMemoryNode}>
          <Icon d={MEM} size={15} />
        </button>
      </div>

      <div className="rail-wrap">
        <button
          className={`rail-btn ${menu === "bus" ? "on" : ""}`}
          title="Where the Bus is listening"
          onClick={() => setMenu(menu === "bus" ? null : "bus")}
        >
          <Icon d={INFO} />
        </button>
        {menu === "bus" && (
          <div className="rail-menu">
            <BusChip />
          </div>
        )}
      </div>
    </div>
  );
}

function BusChip() {
  const [info, setInfo] = useState<ReactNode>("Checking…");
  useEffect(() => {
    let alive = true;
    api
      .getBusInfo()
      .then((b) => {
        if (!alive) return;
        setInfo(
          b.port === 0 ? (
            "The Bus is still starting."
          ) : (
            <>
              Listening on <b>127.0.0.1:{b.port}</b>
              <br />
              Token <b>{b.token.slice(0, 8)}…</b>
              <br />
              Every agent reaches it as an MCP server.
            </>
          )
        );
      })
      .catch(() => alive && setInfo("The Bus is not listening."));
    return () => {
      alive = false;
    };
  }, []);
  return <div className="bus-chip">{info}</div>;
}
