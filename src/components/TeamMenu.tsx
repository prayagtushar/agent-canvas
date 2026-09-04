import { useState } from "react";
import { useStore } from "../store";
import {
  BUILT_IN,
  deleteTeam,
  harnessSummary,
  loadSaved,
  resolveHarnesses,
  saveTeam,
} from "../teams";
import type { Team } from "../types";

/** The launcher: harnesses one at a time, or a whole team at once.
 *
 *  Shared by the rail and the empty canvas, because there should be one list
 *  of what you can start, not two that drift apart. */
export default function TeamMenu({ onDone }: { onDone: () => void }) {
  const harnesses = useStore((s) => s.harnesses);
  const launchAgent = useStore((s) => s.launchAgent);
  const launchTeam = useStore((s) => s.launchTeam);
  const teamFromCanvas = useStore((s) => s.teamFromCanvas);
  const pushToast = useStore((s) => s.pushToast);
  const agentCount = useStore(
    (s) => s.nodes.filter((n) => n.type === "agent" && !n.data.pending).length
  );

  const [saved, setSaved] = useState<Team[]>(() => loadSaved());
  const [naming, setNaming] = useState(false);

  // What a team will really start here, not what its template asked for. The
  // launcher substitutes a missing CLI for one that is installed, and until
  // this line existed the menu never said so: on a machine with only opencode,
  // "Second opinion — two different CLIs" started two of the same one.
  const installed = harnesses.filter((h) => h.available).map((h) => h.name);
  const labelOf = (name: string) =>
    harnesses.find((h) => h.name === name)?.label ?? name;
  const runsOn = (team: Team) =>
    harnessSummary(resolveHarnesses(team, installed), labelOf);

  const start = (team: Team) => {
    onDone();
    void launchTeam(team);
  };

  const save = (label: string) => {
    setNaming(false);
    const name = label.trim();
    if (!name) return;
    const team = teamFromCanvas(name);
    if (!team) {
      pushToast("err", "There are no agents on the canvas to save.");
      return;
    }
    setSaved(saveTeam(team));
    pushToast("ok", `Saved “${name}”. Launch it again from the same menu.`);
  };

  return (
    <>
      <div className="menu-head">Launch a team</div>
      {BUILT_IN.map((t) => (
        <button
          key={t.id}
          className="menu-item team-item"
          disabled={installed.length === 0}
          onClick={() => start(t)}
        >
          <span className="team-name">
            <span>{t.label}</span>
            <span className="team-blurb">{t.blurb}</span>
            {installed.length > 0 && (
              <span className="team-runs-on">{runsOn(t)}</span>
            )}
          </span>
          <span className="muted small">{t.members.length}</span>
        </button>
      ))}

      {saved.length > 0 && (
        <>
          <div className="menu-sep" />
          <div className="menu-head">Your teams</div>
          {saved.map((t) => (
            <button key={t.id} className="menu-item team-item" onClick={() => start(t)}>
              <span className="team-name">
                <span>{t.label}</span>
                <span className="team-blurb">{t.blurb}</span>
              </span>
              <span
                className="team-forget"
                role="button"
                tabIndex={0}
                title="Forget this team"
                onClick={(e) => {
                  e.stopPropagation();
                  setSaved(deleteTeam(t.id));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    setSaved(deleteTeam(t.id));
                  }
                }}
              >
                ✕
              </span>
            </button>
          ))}
        </>
      )}

      {agentCount > 0 && (
        <>
          <div className="menu-sep" />
          {naming ? (
            <input
              className="team-save-input"
              autoFocus
              placeholder="Name this team, then Enter"
              maxLength={40}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") save(e.currentTarget.value);
                else if (e.key === "Escape") setNaming(false);
              }}
              onBlur={(e) => save(e.currentTarget.value)}
            />
          ) : (
            <button className="menu-item" onClick={() => setNaming(true)}>
              <span>Save this canvas as a team</span>
              <span className="muted small">{agentCount}</span>
            </button>
          )}
        </>
      )}

      <div className="menu-sep" />
      <div className="menu-head">Or one agent</div>
      {harnesses.map((h) => (
        <button
          key={h.name}
          className="menu-item"
          disabled={!h.available}
          title={h.available ? undefined : `${h.name} is not on your PATH`}
          onClick={() => {
            onDone();
            void launchAgent(h.name);
          }}
        >
          <span>{h.label}</span>
          {!h.available ? (
            <span className="muted small">not installed</span>
          ) : (
            !h.bus && (
              <span
                className="muted small"
                title="Runs on the canvas, but cannot see peers or tasks"
              >
                no bus
              </span>
            )
          )}
        </button>
      ))}
      {harnesses.length === 0 && (
        <div className="menu-item muted">No harnesses found on PATH</div>
      )}
    </>
  );
}
