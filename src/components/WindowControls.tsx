import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ownFrame } from "../surface";

/** Minimise, maximise and close, drawn by us on the platforms that have no
 *  native frame to use.
 *
 *  macOS keeps its native traffic lights over our title bar, so there is
 *  nothing to draw there. Windows and Linux both run `decorations: false`,
 *  because a native title bar above a custom one is two title bars, so on
 *  both of them these buttons are the only way to close the window. */

/** Minimise, maximise and close, in the order and shape Windows draws them.
 *  The glyphs are Segoe's, as strokes rather than a font, so they match the
 *  rest of the chrome and do not depend on what is installed. */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!ownFrame) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let alive = true;

    void win
      .isMaximized()
      .then((v) => alive && setMaximized(v))
      .catch(() => undefined);
    void win
      .onResized(() => {
        void win
          .isMaximized()
          .then((v) => alive && setMaximized(v))
          .catch(() => undefined);
      })
      .then((off) => {
        if (alive) unlisten = off;
        else off();
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  if (!ownFrame) return null;
  const win = getCurrentWindow();

  return (
    <div className="win-controls">
      <button
        className="win-ctl"
        title="Minimise"
        aria-label="Minimise"
        onClick={() => void win.minimize().catch(() => undefined)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="win-ctl"
        title={maximized ? "Restore" : "Maximise"}
        aria-label={maximized ? "Restore" : "Maximise"}
        onClick={() => void win.toggleMaximize().catch(() => undefined)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          {maximized ? (
            <>
              <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" />
              <path d="M2.5 2.5V0.5h7v7h-2" stroke="currentColor" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
          )}
        </svg>
      </button>
      <button
        className="win-ctl win-ctl-close"
        title="Close"
        aria-label="Close"
        onClick={() => void win.close().catch(() => undefined)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
