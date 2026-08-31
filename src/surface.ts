import { hasBackend } from "./api";

/** What is behind the window, and therefore whether the app has to paint its
 *  own backdrop.
 *
 *  The whole design assumes blurred wallpaper sits under the glass: `--tint`
 *  is a translucent scrim, and `html`, `body` and the canvas are all fully
 *  transparent so vibrancy reads through. That holds on macOS
 *  (`underWindowBackground`) and on Windows (`mica`), because both configs ask
 *  for a window effect.
 *
 *  Nowhere else does. A browser tab has nothing behind it, and neither does
 *  Linux, which has no window effect to ask for. There the scrim washes over
 *  whatever the host happens to paint, which is why the interface looked
 *  bleached in a light-mode browser: dark chrome, no background, white page.
 *
 *  So the test is for the platforms known to supply a backdrop rather than
 *  against the ones known to lack one. A platform nobody has tried yet gets
 *  the painted backdrop and looks plain, instead of getting transparency and
 *  looking broken. */

const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

export const isWindows = /Windows/i.test(ua);
export const isMac = /Macintosh|Mac OS X/i.test(ua) && !/Android/i.test(ua);
export const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);

/** True where the OS blurs the desktop behind the window for us. */
export function hasVibrancy(): boolean {
  return hasBackend() && (isMac || isWindows);
}

/** Windows and Linux both run with `decorations: false`, so minimise,
 *  maximise and close are ours to draw. macOS keeps its native traffic
 *  lights over our title bar and needs nothing. */
export const ownFrame = isWindows || isLinux;

/** Tell the stylesheet which of the two it is. Runs once, before first paint,
 *  so nothing renders against the wrong background. */
export function applySurface(): void {
  document.documentElement.dataset.surface = hasVibrancy() ? "vibrancy" : "painted";
}
