import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api } from "./api";
import { ANSI } from "./palettes";
import type { Theme } from "./types";

/** Terminals outlive the React components that show them.
 *
 *  A node can unmount for reasons that have nothing to do with the agent —
 *  React re-running an effect, the operator collapsing something — and an
 *  agent's scrollback must survive all of it. So the emulator, its addon and
 *  the element it draws into are owned here, and the component only borrows
 *  the element. */
type Entry = {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  /** Last size reported to the pty, so a resize that changes nothing is not
   *  sent — a spurious SIGWINCH makes a TUI repaint its whole screen. */
  sent: { cols: number; rows: number };
  /** Frames spent waiting for the emulator to be able to measure a glyph. */
  waited: number;
};

const entries = new Map<string, Entry>();

/** Output that arrived before the node had a terminal to put it in. Bounded:
 *  a CLI that fails at startup can spew for as long as the operator leaves it. */
const buffered = new Map<string, string>();
const BUFFER_MAX = 256 * 1024;

function baseOptions(): ConstructorParameters<typeof Terminal>[0] {
  return {
    fontFamily: '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.22,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: "bar",
    scrollback: 5000,
    // The node paints `--term-bg` behind the terminal, and the window is
    // translucent over the desktop. An opaque terminal would punch a hole in
    // that, so the emulator draws on nothing and lets the node show through.
    allowTransparency: true,
    // Agent CLIs pick colours that suit their own palette. Nudging them for
    // contrast would repaint every harness in the same wash.
    minimumContrastRatio: 1,
    theme: themeColors(),
  };
}

/** Surface colours come from the stylesheet so the terminal and the window it
 *  sits in can never disagree; the sixteen ANSI slots come from the palette
 *  table, which is the part CSS has no use for. */
function themeColors(): ITheme {
  const shell = document.querySelector<HTMLElement>(".shell");
  const css = shell ? getComputedStyle(shell) : null;
  const v = (name: string, fallback: string) =>
    css?.getPropertyValue(name).trim() || fallback;
  const theme = (shell?.dataset.theme as Theme) ?? "midnight";
  const ansi = ANSI[theme] ?? ANSI.midnight;
  const accent = v("--wire", "#3d8bfd");
  return {
    background: "rgba(0,0,0,0)",
    foreground: v("--txt", "#eceef2"),
    cursor: accent,
    cursorAccent: v("--term-bg", "#090b0f"),
    selectionBackground: translucent(accent, 0.38),
    black: ansi[0],
    red: ansi[1],
    green: ansi[2],
    yellow: ansi[3],
    blue: ansi[4],
    magenta: ansi[5],
    cyan: ansi[6],
    white: ansi[7],
    brightBlack: ansi[8],
    brightRed: ansi[9],
    brightGreen: ansi[10],
    brightYellow: ansi[11],
    brightBlue: ansi[12],
    brightMagenta: ansi[13],
    brightCyan: ansi[14],
    brightWhite: ansi[15],
  };
}

/** xterm parses colours itself and does not know `color-mix`, so the accent
 *  has to arrive as something it can read. */
function translucent(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(61, 139, 253, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Give this node's terminal to `container`, creating it on first sight.
 *  Called on every mount; reattaching moves the same live element. */
export function attach(nodeId: string, container: HTMLElement): Entry {
  const found = entries.get(nodeId);
  if (found) {
    if (found.host.parentElement !== container) container.appendChild(found.host);
    return found;
  }

  const host = document.createElement("div");
  host.className = "term-host";
  container.appendChild(host);

  const term = new Terminal(baseOptions());
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  term.onData((data) => {
    void api.agentInput(nodeId, data).catch(() => undefined);
  });

  const entry: Entry = { term, fit, host, sent: { cols: 0, rows: 0 }, waited: 0 };
  entries.set(nodeId, entry);
  // A webfont that lands after the first measurement changes the cell size
  // under the terminal, and nothing else would tell it. Guarded: not every
  // environment that can run this has the Font Loading API.
  void document.fonts?.ready.then(() => measure(nodeId)).catch(() => undefined);

  const waiting = buffered.get(nodeId);
  if (waiting) {
    term.write(waiting);
    buffered.delete(nodeId);
  }
  return entry;
}

export function write(nodeId: string, chunk: string) {
  const entry = entries.get(nodeId);
  if (entry) {
    entry.term.write(chunk);
    return;
  }
  const next = (buffered.get(nodeId) ?? "") + chunk;
  buffered.set(nodeId, next.length > BUFFER_MAX ? next.slice(-BUFFER_MAX) : next);
}

/** Measure the node and tell the pty, so the CLI lays itself out to the shape
 *  the operator gave it rather than the one it started at.
 *
 *  This has to succeed. A terminal left at its default 24 rows paints more
 *  rows than the node is tall, and since xterm positions its screen layer
 *  absolutely those extra rows spill out over the window's own footer. */
export function measure(nodeId: string) {
  const entry = entries.get(nodeId);
  if (!entry) return;

  const proposed = entry.fit.proposeDimensions();
  if (!proposed || !proposed.cols || !proposed.rows) {
    // The emulator cannot measure a glyph until the font it was asked for has
    // loaded, and a node mid-resize measures as nothing for a frame. Neither
    // resizes again on its own, so the retry has to come from here.
    if (entry.waited++ < 40) requestAnimationFrame(() => measure(nodeId));
    return;
  }
  entry.waited = 0;
  entry.fit.fit();

  const { cols, rows } = entry.term;
  if (cols === entry.sent.cols && rows === entry.sent.rows) return;
  entry.sent = { cols, rows };
  void api.agentResize(nodeId, cols, rows).catch(() => undefined);
}

export function focus(nodeId: string) {
  entries.get(nodeId)?.term.focus();
}

/** Everything the terminal holds, as plain text. */
export function textOf(nodeId: string): string {
  const entry = entries.get(nodeId);
  if (!entry) return "";
  const buf = entry.term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? "");
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}

/** Whether this terminal's scrollback contains `needle`, case-insensitively.
 *
 *  Scanning is deliberately kept here rather than done by pulling `textOf`
 *  into the store: a canvas of eight agents holds a lot of scrollback, and
 *  building all of it into strings on every keystroke is the difference
 *  between a search box and a stutter. This reads the buffer once and stops
 *  at the first line that matches. */
export function contains(nodeId: string, needle: string): boolean {
  const entry = entries.get(nodeId);
  if (!entry || !needle) return false;
  const q = needle.toLowerCase();
  const buf = entry.term.buffer.active;
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)?.translateToString(true);
    if (line && line.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function clearAll() {
  buffered.clear();
  for (const { term } of entries.values()) term.clear();
}

export function dispose(nodeId: string) {
  buffered.delete(nodeId);
  const entry = entries.get(nodeId);
  if (!entry) return;
  entries.delete(nodeId);
  entry.term.dispose();
  entry.host.remove();
}

/** Repaint every terminal in the theme the operator just picked. */
export function syncTheme() {
  const colors = themeColors();
  for (const { term } of entries.values()) term.options.theme = colors;
}
