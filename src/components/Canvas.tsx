import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import AgentNode from "./nodes/AgentNode";
import TaskBoardNode from "./nodes/TaskBoardNode";
import NoteNode from "./nodes/NoteNode";
import MemoryNode from "./nodes/MemoryNode";
import Toolbar from "./Toolbar";
import CommandBar from "./CommandBar";
import { useStore } from "../store";
import { api } from "../api";

const nodeTypes = {
  agent: AgentNode,
  taskboard: TaskBoardNode,
  note: NoteNode,
  memory: MemoryNode,
} satisfies NodeTypes;

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

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setCtx({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, nodeId: null });
  }, []);

  const ctxNode = ctx?.nodeId ? nodes.find((n) => n.id === ctx.nodeId) : null;

  return (
    <div className={`canvas-wrap ${search ? "searching" : ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={(_, n) => setSelected(n.id)}
        onPaneClick={() => setSelected(null)}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
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
        {nodes.length === 0 && (
          <div className="empty">
            <div className="empty-inner">
              <div className="empty-title">Nothing on the canvas yet</div>
              <div className="empty-sub">
                Launch an agent from the rail, or type what you want in the bar
                below — try “add a Claude Code agent and a Codex agent, then
                connect them”.
              </div>
            </div>
          </div>
        )}
        <Toolbar />
        <CommandBar />
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
      </ReactFlow>

      {ctx && (
        <div
          className="ctx-menu"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxNode ? (
            <>
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
            <button
              className="menu-item"
              onClick={() => {
                addNote();
                setCtx(null);
              }}
            >
              Add a sticky note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
