import { describe, expect, it } from "vitest";

import baseConf from "../src-tauri/tauri.conf.json";
import macosConf from "../src-tauri/tauri.macos.conf.json";
import windowsConf from "../src-tauri/tauri.windows.conf.json";
import linuxConf from "../src-tauri/tauri.linux.conf.json";

/** Tauri merges a platform config over `tauri.conf.json`, but it does not
 *  merge the `windows` array element by element: the platform array replaces
 *  the base one whole. So every key the base window sets and the platform
 *  file omits is not inherited, it is gone.
 *
 *  That is not theoretical. The app asked for 1440x900 and opened at 800x600,
 *  Tauri's default, on every platform that had a platform file — which is all
 *  of them. It went unnoticed because nothing ever printed the size, and
 *  800x600 looks like a window rather than like a bug. `minWidth` and
 *  `minHeight` were being dropped the same way, so the window could be
 *  dragged below the layout's minimum.
 *
 *  The fix is to repeat the shared keys in each platform file, and this is
 *  what stops them drifting apart again. */

type Window = Record<string, unknown>;

const base: Window = baseConf.app.windows[0];
const platforms: Record<string, Window> = {
  macos: macosConf.app.windows[0],
  windows: windowsConf.app.windows[0],
  linux: linuxConf.app.windows[0],
};

describe("platform window configs", () => {
  for (const [name, win] of Object.entries(platforms)) {
    it(`${name} repeats every key the base window sets`, () => {
      expect(Object.keys(base).filter((k) => !(k in win))).toEqual([]);
    });

    it(`${name} keeps the size the design was built for`, () => {
      expect([win.width, win.height]).toEqual([base.width, base.height]);
      expect([win.minWidth, win.minHeight]).toEqual([base.minWidth, base.minHeight]);
    });
  }

  it("only Linux turns transparency off, because only it has no window effect", () => {
    expect(platforms.macos.transparent).toBe(true);
    expect(platforms.windows.transparent).toBe(true);
    expect(platforms.linux.transparent).toBe(false);
    expect(platforms.linux.windowEffects).toBeUndefined();
  });

  it("every window declares itself dark", () => {
    // Mica and vibrancy both choose their material from the window theme
    // rather than from the stylesheet. Left unset they follow the user's
    // system theme, and a light-themed Windows rendered a light backdrop
    // behind an app that is dark throughout: the empty-state text came out
    // grey on grey. Caught by photographing the Windows window in CI.
    expect(base.theme).toBe("Dark");
    for (const win of Object.values(platforms)) expect(win.theme).toBe("Dark");
  });

  it("macOS keeps its native frame, the other two draw their own", () => {
    // `ownFrame` in src/surface.ts is the frontend half of this.
    expect(platforms.macos.decorations).toBe(true);
    expect(platforms.windows.decorations).toBe(false);
    expect(platforms.linux.decorations).toBe(false);
  });
});
