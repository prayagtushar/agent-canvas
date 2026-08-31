import type { MemoryEntry } from "../types";

/** Who just wrote something to shared memory.
 *
 *  The Bus sends the whole memory list on every change rather than a delta, so
 *  the office works out what is new by comparing. A key that was already there
 *  with the same timestamp is the same note being re-sent; the same key with a
 *  newer timestamp is somebody overwriting it, which is worth a trip too.
 *
 *  Authors are node ids, because that is what the MCP shim puts in the write.
 *  Duplicates collapse: an agent that wrote three notes at once makes one trip,
 *  not three overlapping ones. */
export function justWrote(before: MemoryEntry[], after: MemoryEntry[]): string[] {
  const seen = new Map<string, number>();
  for (const e of before) seen.set(e.key, e.ts);

  const authors: string[] = [];
  for (const e of after) {
    const was = seen.get(e.key);
    if (was !== undefined && was >= e.ts) continue;
    if (!e.author || authors.includes(e.author)) continue;
    authors.push(e.author);
  }
  return authors;
}
