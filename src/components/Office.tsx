import { useMemo, useState } from "react";
import {
  harnessColor,
  HARNESS_LABEL,
  initials,
  STATUS_COLOR,
  TAG_CLASS,
} from "../harness";
import { BOARD, DOOR, MANAGER, ROOM, SHELF, desks, walkMs } from "../office/layout";
import { place } from "../office/place";
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

  const seats = useMemo(() => desks(agents.length), [agents.length]);

  // Who is blocked on you, by node. An unanswered approval is the strongest
  // thing this view can say, so it is looked up per agent rather than summed.
  const blocked = useMemo(() => {
    const out = new Set<string>();
    for (const a of approvals) if (a.answer === null) out.add(a.fromNode);
    return out;
  }, [approvals]);

  const deskOf = useMemo(() => {
    const byId = new Map<string, (typeof seats)[number]>();
    agents.forEach((a, i) => seats[i] && byId.set(a.id, seats[i]));
    return (id: string) => byId.get(id);
  }, [agents, seats]);

  if (agents.length === 0) {
    return (
      <div className="office">
        <div className="office-empty">
          <div className="empty-title">Nobody in yet</div>
          <div className="empty-sub">
            Add an agent and it takes a desk. Its token stands up when it does
            something: carrying a message to a peer, taking work off the board,
            or coming to you when it needs an answer.
          </div>
          <button className="office-back" onClick={() => setOfficeOpen(false)}>
            Back to the canvas
          </button>
        </div>
      </div>
    );
  }

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

      <svg
        className="office-room"
        viewBox={`0 0 ${ROOM.w} ${ROOM.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Office view: ${agents.length} agents`}
      >
        <Room />

        {/* Who can see whom. Under everything else: a connection is context
            for the room, not an object in it. Both ends have to be seated,
            so a wire to the board or a note draws nothing. */}
        {edges.map((e) => {
          const a = deskOf(e.source);
          const b = deskOf(e.target);
          if (!a || !b) return null;
          return (
            <line
              key={e.id}
              className="office-wire"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}

        {/* Desks next, so tokens stand in front of their own furniture. */}
        {agents.map((agent, i) => {
          const seat = seats[i];
          if (!seat) return null;
          return <Desk key={`desk-${agent.id}`} at={seat} />;
        })}

        {agents.map((agent, i) => {
          const seat = seats[i];
          if (!seat) return null;
          const status = statuses[agent.id] ?? agent.data.status ?? "idle";
          const spot = place({
            desk: seat,
            blocked: blocked.has(agent.id),
            errand: errands[agent.id]?.errand ?? null,
            deskOf,
          });
          return (
            <Person
              key={agent.id}
              name={agent.data.label}
              role={agent.data.role}
              harness={agent.data.harness}
              status={status}
              at={spot.point}
              home={seat}
              away={spot.away}
              says={spot.says}
              unread={unread[agent.id] ?? 0}
              onPeek={(on) => setPeekAt(on ? agent.id : null)}
              onSelect={() => {
                setOfficeOpen(false);
                revealNode(agent.id);
              }}
            />
          );
        })}
      </svg>

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

/** Walls, your desk, the board and the shelf. Drawn once and never animated. */
function Room() {
  return (
    <g className="office-fixed">
      <rect
        className="office-floor"
        x={12}
        y={12}
        width={ROOM.w - 24}
        height={ROOM.h - 24}
        rx={10}
      />

      {/* Your desk, at the top, because work comes back to you. */}
      <g transform={`translate(${MANAGER.x} ${MANAGER.y})`}>
        <rect className="office-manager-desk" x={-96} y={-22} width={192} height={44} rx={7} />
        {/* Above the desk, because agents queue below it. */}
        <text className="office-label" y={-34} textAnchor="middle">
          You
        </text>
      </g>

      <Wall at={BOARD} label="Board" />
      <Wall at={SHELF} label="Memory" />

      <g transform={`translate(${DOOR.x} ${DOOR.y})`}>
        <rect className="office-door" x={-14} y={-34} width={28} height={68} rx={5} />
        <text className="office-label" y={52} textAnchor="middle">
          Door
        </text>
      </g>
    </g>
  );
}

function Wall({ at, label }: { at: { x: number; y: number }; label: string }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect className="office-wall-thing" x={-18} y={-46} width={36} height={92} rx={5} />
      <text className="office-label" y={64} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function Desk({ at }: { at: { x: number; y: number } }) {
  return (
    <rect
      className="office-desk"
      x={at.x - 62}
      y={at.y - 16}
      width={124}
      height={32}
      rx={6}
    />
  );
}

/** One agent. A token in its harness colour, seated at its desk or standing
 *  wherever the Bus sent it, with the same status colour the canvas uses. */
function Person({
  name,
  role,
  harness,
  status,
  at,
  home,
  away,
  says,
  unread,
  onPeek,
  onSelect,
}: {
  name: string;
  role?: string;
  harness: string;
  status: string;
  at: { x: number; y: number };
  home: { x: number; y: number };
  away: boolean;
  says: string | null;
  unread: number;
  onPeek: (on: boolean) => void;
  onSelect: () => void;
}) {
  const colour = harnessColor(harness);
  const dot = STATUS_COLOR[status] ?? STATUS_COLOR.idle;
  // Distance decides the walk, so crossing the room reads as further than
  // stepping to the next desk.
  const ms = walkMs(home, at);

  return (
    <g
      className={`office-person ${away ? "is-away" : ""} ${status === "running" ? "is-working" : ""}`}
      transform={`translate(${at.x} ${at.y})`}
      style={{ transitionDuration: `${ms}ms` }}
      onClick={onSelect}
      onMouseEnter={() => onPeek(true)}
      onMouseLeave={() => onPeek(false)}
      onFocus={() => onPeek(true)}
      onBlur={() => onPeek(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <title>
        {name}
        {role ? ` — ${role}` : ""} ({status})
      </title>

      {says && (
        // Above the head normally, below it near the top of the room, where
        // "above" is your desk and the bubble would sit on the furniture.
        <g className="office-bubble" transform={`translate(0 ${at.y < 210 ? 52 : -54})`}>
          <rect x={-72} y={-15} width={144} height={26} rx={13} />
          <text y={3} textAnchor="middle">
            {says.length > 22 ? `${says.slice(0, 21)}…` : says}
          </text>
        </g>
      )}

      {/* On the floor only while standing. A token with a shadow under it
          reads as lifted, which is the cheapest way to tell sitting from
          standing without drawing a chair. */}
      <ellipse className="office-shadow" cy={20} rx={15} ry={4} />

      <circle className="office-token" r={17} style={{ fill: colour }} />
      <text className="office-initials" y={5} textAnchor="middle">
        {initials(name)}
      </text>
      <circle className="office-status" cx={13} cy={-13} r={4.5} style={{ fill: dot }} />

      {/* Peer messages this agent has not read yet. Ctrl/Cubicles floats tool
          indicators over its characters; this is the same idea on data that
          is counted rather than inferred. */}
      {unread > 0 && (
        <g className="office-unread" transform="translate(-15 -14)">
          <circle r={7.5} />
          <text y={3} textAnchor="middle">
            {unread > 9 ? "9+" : unread}
          </text>
        </g>
      )}
      <text className="office-name" y={35} textAnchor="middle">
        {name.length > 14 ? `${name.slice(0, 13)}…` : name}
      </text>
    </g>
  );
}
