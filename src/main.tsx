import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useStore } from "./store";
import * as terminals from "./terminals";
import { applySurface } from "./surface";
// Self-hosted, OFL-licensed. Bundled so the app has no network dependency.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@xyflow/react/dist/style.css";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

// Dev-only handle so the canvas can be driven from the console (and by
// design checks in a plain browser, where Tauri commands are unavailable).
if (import.meta.env.DEV) {
  const w = window as unknown as { canvas: unknown; terminals: unknown };
  w.canvas = useStore;
  w.terminals = terminals;
}

// Before first paint: with no vibrancy behind the window the app has to
// paint its own backdrop, or the glass has nothing to be glass against.
applySurface();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
