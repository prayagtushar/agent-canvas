import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { BusInfo, HarnessDiagnosis, NodeInfo } from "../types";

/** Working time, in whatever unit reads best at that length. */
function minutes(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, "0")}m`;
}

/** Why an agent will or will not run here, and what the session has spent.
 *
 *  Every problem this app has actually hit in the wild has been environmental:
 *  a CLI not on PATH, a CLI not logged in, a version too old for the flags we
 *  pass it. None of that is visible from a canvas of terminals, so the answer
 *  lives here rather than in an issue thread. */
export default function Diagnostics() {
  const open = useStore((s) => s.diagnosticsOpen);
  const setOpen = useStore((s) => s.setDiagnosticsOpen);
  const pushToast = useStore((s) => s.pushToast);
  const comm = useStore((s) => s.comm);

  const [rows, setRows] = useState<HarnessDiagnosis[] | null>(null);
  const [bus, setBus] = useState<BusInfo | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setBusy(true);
    void Promise.all([
      api.diagnoseHarnesses().catch(() => [] as HarnessDiagnosis[]),
      api.getBusInfo().catch(() => null),
      api.listNodes().catch(() => [] as NodeInfo[]),
    ]).then(([harnesses, info, live]) => {
      setRows(harnesses);
      setBus(info);
      setNodes(live);
      setBusy(false);
    });
  };

  useEffect(() => {
    if (open && rows === null) refresh();
    // Deliberately only on open: probing every CLI runs a login shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const installed = (rows ?? []).filter((r) => r.installed);
  const missing = (rows ?? []).filter((r) => !r.installed);

  return (
    <div className="sheet-backdrop" onClick={() => setOpen(false)}>
      <div className="sheet sheet-wide" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span>Diagnostics</span>
          <div className="activity-head-gap" />
          <button className="activity-clear" onClick={refresh} disabled={busy}>
            {busy ? "Checking…" : "Re-check"}
          </button>
          <button className="win-btn" aria-label="Close" title="Close (Esc)" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <div className="sheet-body">
          <div className="diag-section">The Bus</div>
          {bus && bus.port > 0 ? (
            <div className="diag-bus">
              <div>
                Listening on <b>127.0.0.1:{bus.port}</b>, bearer token{" "}
                <b>{bus.token.slice(0, 8)}…</b>
              </div>
              <div className="muted small">
                Every agent reaches it as an MCP server named <b>bus</b>. It binds to
                loopback only and the token is new each launch.
              </div>
              <button
                className="diag-copy"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(`http://127.0.0.1:${bus.port} ${bus.token}`)
                    .then(() => pushToast("ok", "Bus address copied."))
                    .catch(() => pushToast("err", "Could not copy."));
                }}
              >
                Copy address
              </button>
            </div>
          ) : (
            <div className="diag-bad">
              The Bus is not listening. Agents will run, but none of them can see a
              peer, a task, or shared memory. Reload the canvas.
            </div>
          )}

          {nodes.length > 0 && (
            <>
              <div className="diag-section">
                What this session has spent
                <span className="activity-count">{comm.turns} turns</span>
              </div>
              <div className="diag-spend">
                {nodes.map((n) => (
                  <div key={n.id} className="diag-row">
                    <div className="diag-name">
                      <span className="diag-dot ok" />
                      {n.label}
                      <span className="diag-version">
                        {n.turns ?? 0} turn{(n.turns ?? 0) === 1 ? "" : "s"} ·{" "}
                        {minutes(n.busy_ms ?? 0)} working
                      </span>
                    </div>
                    <div className="diag-detail">
                      {n.cost_usd || n.tokens
                        ? `${n.tokens ? n.tokens.toLocaleString() + " tokens" : ""}${
                            n.tokens && n.cost_usd ? " · " : ""
                          }${n.cost_usd ? "$" + n.cost_usd.toFixed(4) : ""}`
                        : `${n.harness} does not print what it costs`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="diag-note muted small">
                Turns and working time are counted here and are exact. Tokens and
                dollars are read off each CLI&rsquo;s own screen, so they appear only
                for the ones that print them, and they are what that CLI claims
                rather than what your provider bills.
              </div>
            </>
          )}

          <div className="diag-section">
            Installed
            {rows && <span className="activity-count">{installed.length}</span>}
          </div>
          {rows === null ? (
            <div className="muted small diag-note">Asking your login shell…</div>
          ) : installed.length === 0 ? (
            <div className="diag-bad">
              No agent CLIs on your PATH. Agent Canvas runs the CLIs you already have,
              so install one and press Re-check.
            </div>
          ) : (
            installed.map((r) => (
              <div key={r.name} className="diag-row">
                <div className="diag-name">
                  <span className="diag-dot ok" />
                  {r.label}
                  <span className="diag-version">{r.version || "version unknown"}</span>
                </div>
                <div className="diag-detail">{r.path}</div>
                <div className={`diag-detail ${r.bus ? "" : "is-warn"}`}>
                  Bus: {r.wiring}
                </div>
              </div>
            ))
          )}

          {missing.length > 0 && (
            <>
              <div className="diag-section">
                Not installed
                <span className="activity-count">{missing.length}</span>
              </div>
              <div className="diag-missing">
                {missing.map((r) => (
                  <span key={r.name} className="diag-chip" title={r.wiring}>
                    {r.label}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="diag-note muted small">
            A CLI can be installed and still refuse to start a turn: not logged in, a
            model your account cannot use, or a config hook of your own awaiting
            approval. Those show up on the agent&rsquo;s own terminal, which is why the
            canvas draws the real one.
          </div>
        </div>
      </div>
    </div>
  );
}
