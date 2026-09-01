/** Where everything stands in the office.
 *
 *  Pure arithmetic on a fixed coordinate space, kept apart from React so the
 *  arrangement can be tested without rendering anything. The view scales this
 *  room to whatever space it is given, so these units are not pixels.
 *
 *  The room is arranged the way the metaphor wants to be read. You are at the
 *  top, because work comes back to you. The board is on a wall, because agents
 *  walk to it. Desks face you. Nothing here is decoration: every station is
 *  somewhere an agent can actually be sent by an event on the Bus. */

export type Point = { x: number; y: number };

/** 1000x640 scales to a whole number of 16-pixel tiles, which the pixel
 *  renderer needs and nothing else cares about.
 *
 *  Tried widening this to fit more room in. It fits more *floor* in: the
 *  sprites are drawn for this scale, so a bigger room is the same furniture
 *  with more gaps between it. The room is the size the art is. */
export const ROOM = { w: 1000, h: 640 };

/** Your desk. Agents come here when they are blocked on you. */
export const MANAGER: Point = { x: ROOM.w / 2, y: 78 };

/** The shared task board, on the left wall. */
export const BOARD: Point = { x: 92, y: 292 };

/** Shared memory, on the right wall. */
export const SHELF: Point = { x: ROOM.w - 92, y: 292 };

/** Where a newly hired agent walks in from. */
export const DOOR: Point = { x: 92, y: 566 };

const FIRST_ROW_Y = 250;
const ROW_GAP = 156;
const COL_GAP = 196;
const MAX_PER_ROW = 4;

/** How many desks stand in each row, front row first.
 *
 *  Rows fill to four and then wrap, and a short last row is not left with a
 *  single desk marooned at one end: five agents read better as three and two
 *  than as four and one. */
export function rows(count: number): number[] {
  if (count <= 0) return [];
  const rowCount = Math.ceil(count / MAX_PER_ROW);
  const perRow = Math.ceil(count / rowCount);
  const out: number[] = [];
  let left = count;
  for (let i = 0; i < rowCount; i++) {
    const take = Math.min(perRow, left);
    out.push(take);
    left -= take;
  }
  return out;
}

/** A desk for every agent, in order. Rows are centred on the room, so the
 *  office stays symmetrical whoever is in it. */
export function desks(count: number): Point[] {
  const out: Point[] = [];
  const plan = rows(count);
  plan.forEach((inRow, rowIndex) => {
    const width = (inRow - 1) * COL_GAP;
    const startX = ROOM.w / 2 - width / 2;
    for (let i = 0; i < inRow; i++) {
      out.push({ x: startX + i * COL_GAP, y: FIRST_ROW_Y + rowIndex * ROW_GAP });
    }
  });
  return out;
}

/** Where an agent stands when it walks somewhere: a step short of the target,
 *  on the side it approached from, so two agents visiting the same desk do not
 *  end up occupying the same point. */
export function standingAt(target: Point, from: Point, offset = 58): Point {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    x: target.x - (dx / distance) * offset,
    y: target.y - (dy / distance) * offset,
  };
}

/** How long a walk should take, so crossing the room reads as further than
 *  stepping to the next desk. Clamped at both ends: instant looks like a
 *  teleport, and slow enough to notice is slow enough to annoy. */
export function walkMs(from: Point, to: Point): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(Math.min(1500, Math.max(420, distance * 1.5)));
}
