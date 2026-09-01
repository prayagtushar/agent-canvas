import { useMemo, useState } from "react";
import { HARNESS_LABEL, STATUS_COLOR, TAG_CLASS } from "../harness";
import PixelOffice from "./PixelOffice";
import { directionOf, recentFor } from "../office/peek";
import { useStore } from "../store";
import type { Activity, AgentFlowNode } from "../types";

/** The canvas, seen as a room.
 *
 *  Same agents, same state, arranged the way the work actually flows: you at
 *  the top, the shared board on a wall, everyone else at a desk facing you.
 *  Nothing in here is invented for the picture. A token stands up because the
 *  Bus said something happened to that agent.
 *
 *  This is a glance view, not a work surface. You cannot read terminal output
 *  in a floor plan, and it does not pretend you can: clicking a desk takes you
 *  back to the canvas with that agent selected. */
export default function Office() {
  const nodes = useStore((s) => s.nodes);
  const statuses = useStore((s) => s.statuses);
  const approvals = useStore((s) => s.approvals);
  const errands = useStore((s) => s.errands);
  const edges = useStore((s) => s.edges);
  const comm = useStore((s) => s.comm);
  const unread = useStore((s) => s.unread);
  const activity = useStore((s) => s.activity);
  const setOfficeOpen = useStore((s) => s.setOfficeOpen);
  const revealNode = useStore((s) => s.revealNode);
  const labelOf = useStore((s) => s.labelOf);

  const agents = useMemo(
    () => nodes.filter((n): n is AgentFlowNode => n.type === "agent"),
    [nodes]
  );

  // Who is blocked on you, by node. An unanswered approval is the strongest
  // thing this view can say, so it is looked up per agent rather than summed.
  const blocked = useMemo(() => {
    const out = new Set<string>();
    for (const a of approvals) if (a.answer === null) out.add(a.fromNode);
    return out;
  }, [approvals]);



  // Which desk the pointer is over. Hovering inspects; clicking still leaves
  // for the canvas.
  const [peekAt, setPeekAt] = useState<string | null>(null);
  const peeked = agents.find((a) => a.id === peekAt) ?? null;

  const working = agents.filter(
    (a) => (statuses[a.id] ?? a.data.status) === "running"
  ).length;

  return (
    <div className="office">
      <div className="office-strip">
        <span>
          <b>{agents.length}</b> {agents.length === 1 ? "agent" : "agents"}
        </span>
        <span className={working ? "office-live" : "muted"}>
          <b>{working}</b> working
        </span>
        {blocked.size > 0 && (
          <span className="office-blocked">
            <b>{blocked.size}</b> {blocked.size === 1 ? "needs" : "need"} you
          </span>
        )}
        <span className="office-strip-gap" />
        <span className="muted">
          {comm.turns}/{comm.turnCap} turns
        </span>
        {/* Absent rather than zero: a CLI that prints no cost has not told us
            it spent nothing, it has told us nothing. */}
        {comm.costUsd > 0 && <span className="muted">${comm.costUsd.toFixed(2)}</span>}
      </div>

      <PixelOffice
        bodies={agents.map((a) => ({
          id: a.id,
          label: a.data.label,
          harness: a.data.harness,
          status: statuses[a.id] ?? a.data.status ?? "idle",
          blocked: blocked.has(a.id),
          errand: errands[a.id]?.errand ?? null,
          unread: unread[a.id] ?? 0,
        }))}
        edges={edges.map((e) => [e.source, e.target] as [string, string])}
        onPeek={setPeekAt}
        onSelect={(id) => {
          setOfficeOpen(false);
          revealNode(id);
        }}
      />

      {agents.length === 0 && (
        // The room still draws, with nobody in it. An empty office is a
        // better answer to "what is this" than a paragraph describing one,
        // and it means the view can be looked at before anything is running.
        <div className="office-empty">
          <div className="empty-title">Nobody in yet</div>
          <div className="empty-sub">
            Add an agent and it takes one of these desks. It sits down to work,
            walks to a colleague to hand something over, and comes to your desk
            when it needs an answer from you.
          </div>
          <button className="office-back" onClick={() => setOfficeOpen(false)}>
            Back to the canvas
          </button>
        </div>
      )}

      {peeked && (
        <Peek
          name={peeked.data.label}
          role={peeked.data.role}
          harness={peeked.data.harness}
          status={statuses[peeked.id] ?? peeked.data.status ?? "idle"}
          lines={recentFor(activity, peeked.id)}
          nodeId={peeked.id}
          labelOf={labelOf}
        />
      )}
    </div>
  );
}

/** What an agent has been up to, without leaving the room.
 *
 *  Anchored to the bottom rather than to the desk: a panel that follows the
 *  pointer around covers the very tokens you are trying to watch. */
function Peek({
  name,
  role,
  harness,
  status,
  lines,
  nodeId,
  labelOf,
}: {
  name: string;
  role?: string;
  harness: string;
  status: string;
  lines: Activity[];
  nodeId: string;
  labelOf: (id: string) => string;
}) {
  return (
    <div className="office-peek">
      <div className="office-peek-head">
        <span className="office-peek-name">{name}</span>
        <span className={`harness-tag ${TAG_CLASS[harness] ?? ""}`}>
          {HARNESS_LABEL[harness] ?? harness}
        </span>
        <span
          className="office-peek-dot"
          style={{ background: STATUS_COLOR[status] ?? STATUS_COLOR.idle }}
        />
        <span className="muted">{status}</span>
      </div>
      {role && <div className="office-peek-role">{role}</div>}
      {lines.length === 0 ? (
        <div className="muted small">No peer traffic yet.</div>
      ) : (
        <ul className="office-peek-lines">
          {lines.map((l) => {
            const sent = directionOf(l, nodeId) === "sent";
            return (
              <li key={l.id}>
                <span className={sent ? "office-peek-out" : "office-peek-in"}>
                  {sent ? `→ ${labelOf(l.to)}` : `← ${labelOf(l.from)}`}
                </span>
                <span className="office-peek-text">{l.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
