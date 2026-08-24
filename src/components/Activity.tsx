import { useEffect, useRef } from "react";
import { useStore } from "../store";

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** What the agents said to each other.
 *
 *  A message between two agents is typed into the recipient's terminal, where
 *  it scrolls away inside a full-screen TUI. Without this panel the only trace
 *  the operator gets is a bead crossing a wire, so the one thing the canvas
 *  exists to show — agents coordinating — is the one thing it does not keep. */
export default function Activity() {
  const open = useStore((s) => s.activityOpen);
  const setOpen = useStore((s) => s.setActivityOpen);
  const activity = useStore((s) => s.activity);
  const clear = useStore((s) => s.clearActivity);
  const labelOf = useStore((s) => s.labelOf);
  const setSelected = useStore((s) => s.setSelected);
  const revealNode = useStore((s) => s.revealNode);
  const listRef = useRef<HTMLDivElement>(null);

  // Follow the tail the way a chat log does.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, activity.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="activity">
      <div className="activity-head">
        <span>Peer traffic</span>
        <span className="activity-count">{activity.length}</span>
        <div className="activity-head-gap" />
        {activity.length > 0 && (
          <button className="activity-clear" title="Clear this log" onClick={clear}>
            Clear
          </button>
        )}
        <button className="win-btn" title="Close (Esc)" aria-label="Close" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div className="activity-body" ref={listRef}>
        {activity.length === 0 ? (
          <div className="activity-empty">
            Nothing has crossed a wire yet. Connect two agents and anything they
            send each other shows up here.
          </div>
        ) : (
          activity.map((m) => (
            <button
              key={m.id}
              className="activity-row"
              title={`Go to ${labelOf(m.to)}`}
              onClick={() => {
                setSelected(m.to);
                revealNode(m.to);
              }}
            >
              <div className="activity-who">
                <b>{labelOf(m.from)}</b>
                <span className="activity-arrow">→</span>
                <b>{labelOf(m.to)}</b>
                <span className="activity-time">{clock(m.ts)}</span>
              </div>
              <div className="activity-text">{m.text}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
