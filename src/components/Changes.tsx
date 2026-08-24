import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";

/** What an agent actually changed on disk.
 *
 *  A canvas of terminals shows what an agent *said* it did. Agents are not
 *  always right about that, and one working in its own worktree has edits
 *  nobody has looked at. This is `git diff` for the folder that agent works
 *  in, without leaving the app. */
export default function Changes() {
  const nodeId = useStore((s) => s.changesFor);
  const close = useStore((s) => s.setChangesFor);
  const labelOf = useStore((s) => s.labelOf);

  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) return;
    setDiff(null);
    setError(null);
    let alive = true;
    void api
      .agentDiff(nodeId)
      .then((text) => alive && setDiff(text))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeId, close]);

  if (!nodeId) return null;

  return (
    <div className="sheet-backdrop" onClick={() => close(null)}>
      <div className="sheet sheet-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span>What {labelOf(nodeId)} changed</span>
          <div className="activity-head-gap" />
          {diff && (
            <button
              className="activity-clear"
              onClick={() => {
                void navigator.clipboard
                  .writeText(diff)
                  .then(() => useStore.getState().pushToast("ok", "Diff copied."))
                  .catch(() => useStore.getState().pushToast("err", "Could not copy."));
              }}
            >
              Copy
            </button>
          )}
          <button className="win-btn" aria-label="Close" title="Close (Esc)" onClick={() => close(null)}>
            ✕
          </button>
        </div>
        <div className="sheet-body">
          {error ? (
            <div className="diag-bad">{error}</div>
          ) : diff === null ? (
            <div className="muted small diag-note">Asking git…</div>
          ) : (
            <pre className="diff-body">
              {diff.split("\n").map((line, i) => (
                <span key={i} className={diffClass(line)}>
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/** Colour a diff line the way every diff is coloured. `+++` and `---` are
 *  headers rather than content, so they are not painted as additions. */
function diffClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "diff-head";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-del";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("diff --git")) return "diff-head";
  return "";
}
