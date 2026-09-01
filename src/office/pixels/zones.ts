import { ROOM_PX } from "./scene";
import type { Point } from "../layout";

/** Dividing the floor into places.
 *
 *  The single biggest difference between this room and the offices it is
 *  modelled on was that theirs have *areas* and ours had one flat floor.
 *  A work area in wood, a kitchen corner in tile, somewhere soft to sit: the
 *  floor material does the dividing, and furniture follows it. Without that a
 *  room is a diagram with props scattered on it.
 *
 *  Measured in whole tiles, because a zone edge that lands mid-tile shows. */
export const TILE = 16;

export type Zone = {
  id: "work" | "kitchen" | "lounge";
  /** In tiles: left, top, width, height. */
  tx: number;
  ty: number;
  tw: number;
  th: number;
};

export const COLS = ROOM_PX.w / TILE;
export const ROWS = ROOM_PX.h / TILE;

/** Both areas live in the right-hand column, clear of the desks.
 *
 *  Separated on x rather than on y, deliberately. The layout centres desks and
 *  wraps at four per row, so the desk block never reaches this column however
 *  many agents there are. Tucking a zone under the desks instead worked until
 *  a third row appeared, which is what the collision test caught. */
export const ZONES: Zone[] = [
  { id: "kitchen", tx: COLS - 5, ty: 1, tw: 4, th: 4 },
  { id: "lounge", tx: COLS - 5, ty: ROWS - 5, tw: 4, th: 4 },
];

export function zoneById(id: Zone["id"]): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

/** A zone's rectangle in pixels. */
export function pixelsOfZone(z: Zone): { x: number; y: number; w: number; h: number } {
  return { x: z.tx * TILE, y: z.ty * TILE, w: z.tw * TILE, h: z.th * TILE };
}

/** Whether a point falls inside a zone. */
export function inZone(z: Zone, p: Point): boolean {
  const r = pixelsOfZone(z);
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** Whether any zone covers this point. Used to keep the desk carpet from
 *  being laid on top of the kitchen. */
export function inAnyZone(p: Point): boolean {
  return ZONES.some((z) => inZone(z, p));
}

/** Somewhere for the cat to wander that is not a desk and not the doorway.
 *  It gets the lounge, which is the one part of the room with no work in it. */
export function catRange(): { x0: number; x1: number; y0: number; y1: number } {
  const lounge = zoneById("lounge");
  if (!lounge) {
    return { x0: 40, x1: ROOM_PX.w - 40, y0: ROOM_PX.h - 60, y1: ROOM_PX.h - 30 };
  }
  const r = pixelsOfZone(lounge);
  return {
    x0: r.x + 10,
    x1: r.x + r.w - 10,
    y0: r.y + 10,
    y1: r.y + r.h - 10,
  };
}
