import { BOARD, DOOR, MANAGER, ROOM, SHELF, desks, type Point } from "../layout";

/** The room in pixels.
 *
 *  The arrangement is already decided and already tested in `../layout`, in
 *  arbitrary units. This is only the change of scale into a pixel grid, kept
 *  in one place so the two views cannot end up with agents at different desks.
 *
 *  0.4 puts the room at 400x256, which is 25x16 tiles: big enough for eight
 *  desks, a kitchen corner and a place to sit, and small enough that it still
 *  draws at 3x in a 1440x900 window.
 *
 *  0.625 was tried, for a 40x25 room closer to the reference offices. Theirs
 *  works because their characters are 16x32; ours are half that, so all the
 *  extra tiles came back as empty floor. */
export const SCALE = 0.4;

export const ROOM_PX = {
  w: Math.round(ROOM.w * SCALE),
  h: Math.round(ROOM.h * SCALE),
};

/** Layout units to whole pixels. Rounded, because half a pixel in pixel art
 *  is a blurred edge. */
export function toPixel(p: Point): Point {
  return { x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) };
}

export const MANAGER_PX = toPixel(MANAGER);
export const BOARD_PX = toPixel(BOARD);
export const SHELF_PX = toPixel(SHELF);
export const DOOR_PX = toPixel(DOOR);

/** Every desk, in pixels, in the same order as the agents. */
export function desksPx(count: number): Point[] {
  return desks(count).map(toPixel);
}

/** Top-left corner for a sprite of this size centred on a point. Sprites are
 *  drawn from their corner; everything else in the office thinks in centres. */
export function corner(centre: Point, w: number, h: number): Point {
  return { x: Math.round(centre.x - w / 2), y: Math.round(centre.y - h / 2) };
}

/** Which way a character should face to walk from `from` to `to`.
 *
 *  Sideways wins ties and near-ties: a character walking mostly across the
 *  room but drifting slightly up looks wrong facing away from you, and the
 *  side pose is the one with the most detail in it. */
export function facing(from: Point, to: Point): "up" | "down" | "side" {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) * 0.75) return "side";
  return dy < 0 ? "up" : "down";
}

/** Whether a character walking this way should be mirrored. */
export function mirrored(from: Point, to: Point): boolean {
  return to.x < from.x;
}

/** Where along a walk a character is, 0 at the desk and 1 at the destination.
 *  Eased, so it starts and stops rather than sliding at a constant rate. */
export function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** Point along the way from `a` to `b`. */
export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
