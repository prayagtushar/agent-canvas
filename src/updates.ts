import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Checking whether a newer build exists, and installing it.
 *
 *  Updates are signed: the app carries a public key and refuses anything the
 *  matching private key did not sign, so a compromised release host cannot
 *  push code to anyone. A build made without that key pair has no way to trust
 *  an update and simply says so — which is better than an error dialog nobody
 *  can act on. */

export type UpdateState =
  | { kind: "none" }
  | { kind: "available"; version: string; notes: string; install: () => Promise<void> }
  | { kind: "unsupported"; why: string };

/** Look for a newer release. Never throws: a failed check is not worth
 *  interrupting anyone, and this runs on startup. */
export async function look(): Promise<UpdateState> {
  try {
    const update = await check();
    if (!update) return { kind: "none" };
    return {
      kind: "available",
      version: update.version,
      notes: update.body ?? "",
      install: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
  } catch (e) {
    const why = String(e);
    // The common cases, said plainly. A build with no signing key is the
    // normal state for anyone running from source.
    if (/public key|pubkey|signature|not configured|Updater/i.test(why)) {
      return {
        kind: "unsupported",
        why: "This build cannot check for updates — it was made without an update key. Download new versions from the releases page.",
      };
    }
    return { kind: "unsupported", why: `Could not reach the update server — ${why}` };
  }
}
