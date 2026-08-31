import { afterEach, describe, expect, it, vi } from "vitest";

/** Load `surface.ts` fresh against one platform.
 *
 *  The platform flags are read once at module scope, the way the real app
 *  reads them, so each case needs its own import rather than a reassignment. */
async function on(userAgent: string, tauri: boolean) {
  vi.resetModules();
  vi.stubGlobal("navigator", { userAgent });
  if (tauri) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  return import("./surface");
}

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  delete document.documentElement.dataset.surface;
});

describe("which platforms hand us a backdrop", () => {
  it("macOS and Windows do, because both configs ask for a window effect", async () => {
    expect((await on(MAC, true)).hasVibrancy()).toBe(true);
    expect((await on(WIN, true)).hasVibrancy()).toBe(true);
  });

  it("Linux does not, so the app paints its own", async () => {
    // The regression this guards: the Linux build shipped as a transparent
    // window with nothing behind it, because only macOS and Windows have a
    // per-platform config asking for an effect.
    expect((await on(LINUX, true)).hasVibrancy()).toBe(false);
  });

  it("a browser does not, whatever it is running on", async () => {
    for (const ua of [MAC, WIN, LINUX]) {
      expect((await on(ua, false)).hasVibrancy()).toBe(false);
    }
  });

  it("an unrecognised platform gets the backdrop rather than transparency", async () => {
    // Failing towards plain-looking beats failing towards see-through.
    expect((await on("Mozilla/5.0 (Something New)", true)).hasVibrancy()).toBe(false);
  });
});

describe("who draws the window frame", () => {
  it("we do on Windows and Linux, which both run without decorations", async () => {
    expect((await on(WIN, true)).ownFrame).toBe(true);
    expect((await on(LINUX, true)).ownFrame).toBe(true);
  });

  it("macOS keeps its own traffic lights", async () => {
    expect((await on(MAC, true)).ownFrame).toBe(false);
  });
});

describe("applySurface", () => {
  it("marks the document before anything paints", async () => {
    const painted = await on(LINUX, true);
    painted.applySurface();
    expect(document.documentElement.dataset.surface).toBe("painted");

    const vibrancy = await on(MAC, true);
    vibrancy.applySurface();
    expect(document.documentElement.dataset.surface).toBe("vibrancy");
  });
});
