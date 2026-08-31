import type { Activity } from "../types";

/** What one agent has been saying and hearing lately.
 *
 *  Ctrl/Cubicles pairs its pixel office with a session inspector, and it is the
 *  right idea: watching a token move tells you something happened but not what.
 *  The version here stays inside the room. Clicking a desk already leaves for
 *  the canvas, and having to leave to find out what a walk meant defeats the
 *  point of a glance view.
 *
 *  Newest first, because the last thing said is the reason you looked. */
export function recentFor(
  activity: Activity[],
  nodeId: string,
  limit = 4
): Activity[] {
  const mine = activity.filter((a) => a.from === nodeId || a.to === nodeId);
  return mine.slice(-limit).reverse();
}

/** Which way a line of traffic went, from this agent's point of view. */
export function directionOf(entry: Activity, nodeId: string): "sent" | "received" {
  return entry.from === nodeId ? "sent" : "received";
}
