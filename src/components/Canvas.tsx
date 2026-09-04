import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import AgentNode from "./nodes/AgentNode";
import TaskBoardNode from "./nodes/TaskBoardNode";
import NoteNode from "./nodes/NoteNode";
import MemoryNode from "./nodes/MemoryNode";
import WireEdge from "./WireEdge";
import { useStore } from "../store";
import { BUILT_IN } from "../teams";
import type { AgentFlowNode } from "../types";
import { api, hasBackend } from "../api";

const nodeTypes = {
  agent: AgentNode,
  taskboard: TaskBoardNode,
  note: NoteNode,
  memory: MemoryNode,
} satisfies NodeTypes;

const edgeTypes = { wire: WireEdge } satisfies EdgeTypes;

function minimapNodeColor(node: { type?: string }): string {
  if (node.type === "note") return "#f7e9a8";
  if (node.type === "memory") return "#c084fc";
  if (node.type === "taskboard") return "#3d8bfd";
  return "#2fd45e";
}

type Ctx = { x: number; y: number; nodeId: string | null };

export default function Canvas() {
  const [ctx, setCtx] = useState<Ctx | null>(null);

  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const search = useStore((s) => s.search);
  const setZoom = useStore((s) => s.setZoom);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const setSelected = useStore((s) => s.setSelected);
  const removeNode = useStore((s) => s.removeNode);
  const addNote = useStore((s) => s.addNote);
  const pushToast = useStore((s) => s.pushToast);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ctx]);

  // The Bus owns the peer graph. Ask it to connect, then let its
  // `edges` event paint the canvas — never the other way round.
  const onConnect = useCallback(
    (conn: Connection) => {
      const src = nodes.find((n) => n.id === conn.source);
      const tgt = nodes.find((n) => n.id === conn.target);
      if (!src || !tgt) return;
      if (src.type !== "agent" || tgt.type !== "agent") {
        pushToast("err", "Only agents can be connected to each other.");
        return;
      }
      void api
        .addEdge(conn.source, conn.target)
        .catch((e) => pushToast("err", String(e)));
    },
    [nodes, pushToast]
  );

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach((e) => {
      if (e.source && e.target) void api.removeEdge(e.source, e.target);
    });
  }, []);

  /* One handler for the whole canvas, and the node is read off the DOM.
     ReactFlow's own onNodeContextMenu never sees a right-click inside an
     agent's terminal — the emulator's element is created outside React — so
     right-clicking the thing you are looking at gave you the canvas menu. */
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.(".react-flow__node");
    const nodeId = el?.getAttribute("data-id") ?? null;
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, nodeId });
  }, []);

  const ctxNode = ctx?.nodeId ? nodes.find((n) => n.id === ctx.nodeId) : null;

  /* Every other agent, so a connection can be made from a menu. Dragging one
     dot onto another is precise work at any zoom, and it is the single most
     important thing on this canvas: without an edge, agents cannot see each
     other at all. */
  const peers =
    ctxNode?.type === "agent"
      ? nodes.filter(
          (n): n is AgentFlowNode =>
            n.type === "agent" && n.id !== ctxNode.id && !n.data.pending
        )
      : [];
  const isConnected = (a: string, b: string) =>
    edges.some(
      (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
    );

  return (
    <div
      className={`canvas-wrap ${search ? "searching" : ""}`}
      onContextMenu={onContextMenu}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_, n) => setSelected(n.id)}
        onPaneClick={() => setSelected(null)}
        onInit={(inst) => useStore.getState().setFlow(inst)}
        onMove={(_, state) => setZoom(state.zoom * 100)}
        defaultViewport={{ x: 60, y: 60, zoom: 0.92 }}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1}
          color="rgba(255,255,255,0.12)"
        />
        {nodes.length === 0 && <Empty />}
        {/* A map of nothing is a framed empty box in the corner, and the empty
            canvas is the first thing anyone sees. The minimap already stands
            down for the dock, focus mode and narrow windows; this is the same
            rule for the case where there is nothing to map. */}
        {nodes.length > 0 && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            bgColor="rgba(10,13,19,0.72)"
            maskColor="rgba(4,6,11,0.62)"
            nodeColor={minimapNodeColor}
            nodeStrokeColor="rgba(255,255,255,0.22)"
            nodeBorderRadius={3}
            style={{ width: 182, height: 124, border: "1px solid rgba(255,255,255,0.1)" }}
          />
        )}
      </ReactFlow>

      {ctx && (
        <div
          className="ctx-menu"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxNode ? (
            <>
              {ctxNode.type === "agent" && peers.length > 0 && (
                <>
                  <div className="menu-head">Connected to</div>
                  {peers.map((p) => {
                    const on = isConnected(ctxNode.id, p.id);
                    return (
                      <button
                        key={p.id}
                        className="menu-item"
                        title={on ? "Disconnect these two" : "Let these two see each other"}
                        onClick={() => {
                          const call = on ? api.removeEdge : api.addEdge;
                          void call(ctxNode.id, p.id).catch((e) =>
                            pushToast("err", String(e))
                          );
                          setCtx(null);
                        }}
                      >
                        <span>{p.data.label}</span>
                        <span className={on ? "tick" : "muted small"}>{on ? "✓" : "connect"}</span>
                      </button>
                    );
                  })}
                  <div className="menu-sep" />
                </>
              )}
              {ctxNode.type === "agent" && (
                <button
                  className="menu-item"
                  onClick={() => {
                    void api.interruptAgent(ctxNode.id).catch(() => undefined);
                    setCtx(null);
                  }}
                >
                  Interrupt
                </button>
              )}
              <button
                className="menu-item"
                onClick={() => {
                  removeNode(ctxNode.id);
                  setCtx(null);
                }}
              >
                {ctxNode.type === "agent" ? "Stop and remove" : "Remove"}
              </button>
            </>
          ) : (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  addNote();
                  setCtx(null);
                }}
              >
                Add a sticky note
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  useStore.getState().frameAll();
                  setCtx(null);
                }}
              >
                <span>Fit everything on screen</span>
                <span className="muted small">⌘0</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The first thing anyone sees. It names the folder agents will run in and
 *  starts a working team in one click, rather than describing where a button
 *  is and leaving the operator to wire two agents together by hand. */
function Empty() {
  const harnesses = useStore((s) => s.harnesses);
  const launchAgent = useStore((s) => s.launchAgent);
  const launchTeam = useStore((s) => s.launchTeam);
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const resumable = useStore((s) => s.resumable);
  const forgetResumable = useStore((s) => s.forgetResumable);
  const installed = harnesses.filter((h) => h.available);
  const folder = workspaceRoot.split("/").filter(Boolean).pop();

  if (!hasBackend()) {
    return (
      <div className="empty">
        <div className="empty-inner">
          <div className="empty-title">This is the browser preview</div>
          <div className="empty-sub">
            The interface renders here, but an agent needs a real terminal to
            run in, and a browser tab cannot start one. Use{" "}
            <code>bun run tauri dev</code>, or download a release.
          </div>
        </div>
      </div>
    );
  }

  if (installed.length === 0) {
    return (
      <div className="empty">
        <div className="empty-inner">
          <div className="empty-title">No agent CLIs found</div>
          <div className="empty-sub">
            Agent Canvas runs the CLIs you already have. Install Claude Code,
            Codex, Gemini CLI or opencode, then reload the canvas.
          </div>
        </div>
      </div>
    );
  }

  if (resumable) {
    return (
      <div className="empty">
        <div className="empty-inner">
          <div className="empty-title">Pick up where you left off</div>
          <div className="empty-sub">
            {folder
              ? `${resumable.blurb}, in ${folder}. The processes are gone; this starts them again with the same names, roles and wires.`
              : "Choose a working folder in the toolbar first."}
          </div>
          <div className="empty-teams">
            <button className="empty-team" onClick={() => void launchTeam(resumable)}>
              <span className="empty-team-name">Resume</span>
              <span className="empty-team-blurb">{resumable.blurb}</span>
              <span className="empty-team-count">
                {resumable.members.map((m) => m.name).join(" · ")}
              </span>
            </button>
          </div>
          <div className="empty-actions">
            <button className="empty-btn" onClick={forgetResumable}>
              Start fresh instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="empty">
      <div className="empty-inner">
        <div className="empty-title">Start a team</div>
        <div className="empty-sub">
          {folder
            ? `They will run in ${folder}, each in its own terminal, wired to each other.`
            : "Choose a working folder in the toolbar first."}
        </div>
        <div className="empty-teams">
          {BUILT_IN.map((t) => (
            <button key={t.id} className="empty-team" onClick={() => void launchTeam(t)}>
              <span className="empty-team-name">{t.label}</span>
              <span className="empty-team-blurb">{t.blurb}</span>
              <span className="empty-team-count">
                {t.members.map((m) => m.name).join(" · ")}
              </span>
            </button>
          ))}
        </div>
        <div className="empty-actions">
          <span className="empty-or">or one agent</span>
          {installed.map((h) => (
            <button
              key={h.name}
              className="empty-btn"
              onClick={() => void launchAgent(h.name)}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
