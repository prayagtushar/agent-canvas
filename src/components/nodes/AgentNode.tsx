import { memo, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { api } from "../../api";
import { useStore } from "../../store";
import type { AgentFlowNode } from "../../types";

const STATUS_COLOR: Record<string, string> = {
  idle: "#949cab",
  running: "#2fd45e",
  waiting: "#febc2e",
  exited: "#ff5f57",
  error: "#ff5f57",
};

const TAG_CLASS: Record<string, string> = {
  claude: "tag-claude",
  codex: "tag-codex",
  gemini: "tag-gemini",
  opencode: "tag-opencode",
};

const HARNESS_LABEL: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "opencode",
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
  const output = useStore((s) => s.outputs[data.nodeId]);
  const unread = useStore((s) => s.unread[data.nodeId] ?? 0);
  const status = useStore((s) => s.statuses[data.nodeId]) || data.status;
  const search = useStore((s) => s.search);
  const setNodes = useStore((s) => s.setNodes);
  const setSelected = useStore((s) => s.setSelected);
  const removeNode = useStore((s) => s.removeNode);
  const pushToast = useStore((s) => s.pushToast);

  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLPreElement>(null);
  const pinnedRef = useRef(true);

  // Follow the tail unless the operator has scrolled up to read something.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [output]);

  const running = status === "running" || status === "waiting";
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle;
  const hit = search !== "" && data.label.toLowerCase().includes(search.toLowerCase());
  const dirName = data.cwd.split("/").filter(Boolean).pop() ?? data.cwd;

  const send = () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt("");
    pinnedRef.current = true;
    void api.sendPrompt(data.nodeId, text).catch((e) => pushToast("err", String(e)));
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, style: { ...n.style, width: next ? 860 : 512, height: next ? 590 : 336 } }
          : n
      )
    );
  };

  return (
    <div
      className={`agent-window ${selected ? "selected" : ""} ${hit ? "hit" : ""}`}
      onMouseDown={() => setSelected(id)}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={360}
        minHeight={230}
        lineClassName="resize-line"
        handleClassName="resize-handle"
      />
      <Dots />

      <div className="twin-head">
        <span className={`status-dot ${running ? "dot-pulse" : ""}`} style={{ background: color }} />
        <span className="twin-name">{data.label}</span>
        <span className={`harness-tag ${TAG_CLASS[data.harness] ?? ""}`}>
          {HARNESS_LABEL[data.harness] ?? data.harness}
        </span>
        {unread > 0 && <span className="unread-badge">{unread}</span>}
        <div className="twin-actions">
          {running && (
            <button
              className="win-btn"
              title="Interrupt"
              onClick={() => void api.interruptAgent(data.nodeId).catch(() => undefined)}
            >
              <span className="spinner" />
            </button>
          )}
          <button
            className="win-btn"
            title="Copy this output"
            onClick={() => {
              void navigator.clipboard
                .writeText(output ?? "")
                .then(() => pushToast("ok", `Copied ${data.label}'s output.`))
                .catch(() => pushToast("err", "Could not copy."));
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button className="win-btn" title={expanded ? "Restore size" : "Expand"} onClick={toggleExpand}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 3h6v6M9 21H3v-15M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
          <button className="win-btn danger" title="Stop and remove" onClick={() => removeNode(id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <pre
        ref={bodyRef}
        className="twin-body nowheel"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {output ? (
          <>
            {output}
            {"\n"}
            <span className="cursor-line" />
          </>
        ) : (
          <span className="muted">
            {running
              ? "Starting…"
              : `${HARNESS_LABEL[data.harness] ?? data.harness} is ready. Send it a prompt below.`}
          </span>
        )}
      </pre>

      <div className="twin-foot">
        <div className="prompt-row">
          <span className="prompt-caret">›</span>
          <input
            className="prompt-input nodrag"
            placeholder="Send a prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") send();
            }}
          />
        </div>
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
          <span className="sep">|</span>
          <span className="auto-mode">▶▶ auto mode on</span>
        </div>
      </div>
    </div>
  );
}

const AgentNode = memo(AgentNodeInner);
export default AgentNode;
