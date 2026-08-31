import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { api } from "../../api";
import { matchesSearch, NODE_SIZE, updateNodeData, useStore } from "../../store";
import * as terminals from "../../terminals";
import type { AgentFlowNode } from "../../types";
import AgentTerminal from "./AgentTerminal";
import { HARNESS_LABEL, STATUS_COLOR, STATUS_RING, TAG_CLASS } from "../../harness";

/** Escape cancels a turn in Claude Code and the Gemini-family CLIs; the rest
 *  take Ctrl-C. The backend picks per harness — this is only what the button
 *  tells the operator it will do. */
const CANCEL_KEY: Record<string, string> = {
  claude: "esc",
  gemini: "esc",
  qwen: "esc",
};

/* Eight connection points — four edge midpoints that accept a drag,
   plus four decorative corners, matching the canvas idiom. */
function Dots() {
  const sides: [Position, string][] = [
    [Position.Top, "t"],
    [Position.Bottom, "b"],
    [Position.Left, "l"],
    [Position.Right, "r"],
  ];
  return (
    <>
      {sides.map(([pos, id]) => (
        <span key={id}>
          <Handle id={`${id}-src`} type="source" position={pos} className="handle" />
          <Handle id={`${id}-dst`} type="target" position={pos} className="handle" />
        </span>
      ))}
      <span className="corner-dot" style={{ left: -4, top: -4 }} />
      <span className="corner-dot" style={{ right: -4, top: -4 }} />
      <span className="corner-dot" style={{ left: -4, bottom: -4 }} />
      <span className="corner-dot" style={{ right: -4, bottom: -4 }} />
    </>
  );
}

function AgentNodeInner({ id, data, selected }: NodeProps<AgentFlowNode>) {
  const unread = useStore((s) => s.unread[data.nodeId] ?? 0);
  const status = useStore((s) => s.statuses[data.nodeId]) || data.status;
  const search = useStore((s) => s.search);
  const setNodes = useStore((s) => s.setNodes);
  const setSelected = useStore((s) => s.setSelected);
  const removeNode = useStore((s) => s.removeNode);
  const pushToast = useStore((s) => s.pushToast);
  const revealNode = useStore((s) => s.revealNode);
  const setActivityOpen = useStore((s) => s.setActivityOpen);
  const setChangesFor = useStore((s) => s.setChangesFor);
  const labelOf = useStore((s) => s.labelOf);
  /* Who this agent can see. An agent with no wire is alone on the canvas
     whatever else is on it, and that is not otherwise visible at a glance.
     Derived outside the selector: a selector that builds a fresh array is a
     new value on every render, and zustand would re-render for ever. */
  const edges = useStore((s) => s.edges);
  const peers = useMemo(
    () =>
      edges
        .filter((e) => e.source === id || e.target === id)
        .map((e) => (e.source === id ? e.target : e.source)),
    [edges, id]
  );

  const [renaming, setRenaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const wasBusy = useRef(false);
  /** The size the operator had set before expanding, so restoring gives back
   *  their window rather than the default one. */
  const restoreTo = useRef<{ width: number; height: number } | null>(null);

  const running = status === "running" || status === "waiting";

  // Flash the frame once when a turn ends. Without it the only sign an agent
  // finished is the header dot quietly changing colour.
  useEffect(() => {
    if (wasBusy.current && !running) {
      setDone(true);
      const t = setTimeout(() => setDone(false), 900);
      return () => clearTimeout(t);
    }
    wasBusy.current = running;
  }, [running]);

  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle;
  const hit = matchesSearch({ type: "agent", data } as never, search);
  const dirName = data.cwd.split("/").filter(Boolean).pop() ?? data.cwd;

  /** The name lives on the Bus, because peers read it too. Only once the Bus
   *  has taken it does the canvas show it. */
  const rename = (raw: string) => {
    setRenaming(false);
    const next = raw.trim();
    if (!next || next === data.label) return;
    void api
      .renameAgent(data.nodeId, next)
      .then((stored) => updateNodeData(id, { label: stored }))
      .catch((e) => pushToast("err", `Not renamed — ${String(e)}`));
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        if (next) {
          restoreTo.current = {
            width: Number(n.style?.width) || NODE_SIZE.width,
            height: Number(n.style?.height) || NODE_SIZE.height,
          };
          return { ...n, style: { ...n.style, width: 960, height: 640 } };
        }
        const back = restoreTo.current ?? NODE_SIZE;
        return { ...n, style: { ...n.style, ...back } };
      })
    );
    if (next) revealNode(id);
  };

  // A stand-in for the seconds between the click and a live process. It has
  // no Bus node behind it, so nothing here may call the backend.
  if (data.pending) {
    return (
      <div className="agent-window is-running is-pending">
        <div className="twin-head">
          <span className="spinner" />
          <span className="twin-name">{data.label}</span>
          <span className={`harness-tag ${TAG_CLASS[data.harness] ?? ""}`}>
            {HARNESS_LABEL[data.harness] ?? data.harness}
          </span>
        </div>
        <div className="twin-body">
          <span className="muted">Starting {HARNESS_LABEL[data.harness] ?? data.harness}…</span>
        </div>
        <div className="twin-foot">
          <div className="meta-row">
            <span>⇡ {data.harness}</span>
            <span className="sep">|</span>
            <span>starting</span>
            <span className="sep">|</span>
            <span>{dirName}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`agent-window ${selected ? "selected" : ""} ${hit ? "hit" : ""} ${
        running ? "is-running" : ""
      } ${done ? "just-done" : ""}`}
      onMouseDown={() => setSelected(id)}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={380}
        minHeight={240}
        lineClassName="resize-line"
        handleClassName="resize-handle"
      />
      <Dots />

      <div className="twin-head">
        <span
          className={`status-dot ${running ? "dot-pulse" : ""}`}
          title={status}
          style={{ background: color, ["--dot-ring" as string]: STATUS_RING[status] }}
        />
        {renaming ? (
          <input
            className="twin-rename nodrag"
            autoFocus
            defaultValue={data.label}
            maxLength={40}
            aria-label="Agent name"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                e.currentTarget.value = data.label;
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => rename(e.currentTarget.value)}
          />
        ) : (
          <span
            className="twin-name"
            title="Double-click to rename"
            onDoubleClick={() => setRenaming(true)}
          >
            {data.label}
          </span>
        )}
        <span className={`harness-tag ${TAG_CLASS[data.harness] ?? ""}`}>
          {HARNESS_LABEL[data.harness] ?? data.harness}
        </span>
        {peers.length > 0 && (
          <span
            className="peer-tag"
            title={`Can see ${peers.map(labelOf).join(", ")}`}
          >
            ⇄ {peers.length}
          </span>
        )}
        {unread > 0 && (
          <button
            key={unread}
            className="unread-badge"
            title={`${unread} message${unread === 1 ? "" : "s"} from a peer — read them`}
            onClick={(e) => {
              e.stopPropagation();
              setActivityOpen(true);
            }}
          >
            {unread}
          </button>
        )}
        <div className="twin-actions">
          {running && (
            <button
              className="win-btn"
              title={`Cancel this turn (${CANCEL_KEY[data.harness] ?? "ctrl-c"})`}
              onClick={() => void api.interruptAgent(data.nodeId).catch(() => undefined)}
            >
              <span className="spinner" />
            </button>
          )}
          <button
            className="win-btn"
            title="See what this agent changed on disk"
            aria-label="See what this agent changed on disk"
            onClick={() => setChangesFor(data.nodeId)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h10M4 18h6" />
            </svg>
          </button>
          <button
            className="win-btn"
            title="Copy this output"
            aria-label="Copy this output"
            onClick={() => {
              void navigator.clipboard
                .writeText(terminals.textOf(data.nodeId))
                .then(() => pushToast("ok", `Copied ${data.label}'s output.`))
                .catch(() => pushToast("err", "Could not copy."));
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button className="win-btn" title={expanded ? "Restore size" : "Expand"}
            aria-label={expanded ? "Restore size" : "Expand"} onClick={toggleExpand}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 3h6v6M9 21H3v-15M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
          <button
            className="win-btn"
            title="Quit and relaunch this CLI"
            aria-label="Quit and relaunch this CLI"
            onClick={() => {
              void api
                .restartAgent(data.nodeId)
                .then(() => pushToast("ok", `${data.label} restarted.`))
                .catch((e) => pushToast("err", String(e)));
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
            </svg>
          </button>
          <button className="win-btn danger" title="Stop and remove"
            aria-label="Stop and remove" onClick={() => removeNode(id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <span className="twin-fade" />

      <AgentTerminal nodeId={data.nodeId} />

      <div className="twin-foot">
        <div className="meta-row">
          {data.worktree && (
            <>
              <span className="worktree-tag" title={data.worktree}>
                ⑂ worktree
              </span>
              <span className="sep">|</span>
            </>
          )}
          <span>⇡ {data.harness}</span>
          <span className="sep">|</span>
          <span>{status}</span>
          <span className="sep">|</span>
          <span>{dirName}</span>
          {data.role && (
            <>
              <span className="sep">|</span>
              <span className="role-line" title={`Peers see this: ${data.role}`}>
                {data.role}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const AgentNode = memo(AgentNodeInner);
export default AgentNode;
