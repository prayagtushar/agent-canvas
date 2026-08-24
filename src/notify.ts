import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/** Desktop notifications, for the things worth interrupting someone over.
 *
 *  Agents run for minutes at a time. The whole point of putting them on a
 *  canvas is that you can go and do something else, and the two moments that
 *  should reach you when you have — an agent asking you a question, and the
 *  work finishing — are exactly the two you cannot see from another window. */

let granted: boolean | null = null;

/** Ask once, lazily. Requesting on startup would put a system prompt in front
 *  of someone who has not yet seen the app do anything. */
async function allowed(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
  } catch {
    // Not running under Tauri, or the user's system refused. Either way this
    // is a nicety and must never break the thing that triggered it.
    granted = false;
  }
  return granted;
}

/** True when the operator is looking at something else. Notifying someone
 *  about a window they are already staring at is noise. */
export function away(): boolean {
  return document.hidden || !document.hasFocus();
}

export async function notify(title: string, body: string): Promise<void> {
  if (!(await allowed())) return;
  try {
    sendNotification({ title, body });
  } catch {
    /* a failed notification is not worth a toast about a notification */
  }
}

/** Reset, for tests. */
export function forgetPermission(): void {
  granted = null;
}
