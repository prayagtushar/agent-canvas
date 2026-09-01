/** Turning string art into pixels.
 *
 *  Every sprite in this office is written as rows of characters, one character
 *  per pixel, and coloured through a lookup at draw time. Nothing is loaded
 *  from disk: the art is the source, which keeps the app self-contained, keeps
 *  the sprites diffable in review, and means a character can be recoloured per
 *  harness without shipping four copies of it.
 *
 *  A dot is transparent. Every other character is a key into a palette, and a
 *  key with no colour behind it is skipped rather than drawn black, so a
 *  partial palette degrades to a partial sprite instead of a silhouette. */

export type Sprite = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export const TRANSPARENT = ".";

/** Pixel width of a sprite, taken from its widest row. */
export function widthOf(sprite: Sprite): number {
  return sprite.reduce((w, row) => Math.max(w, row.length), 0);
}

export function heightOf(sprite: Sprite): number {
  return sprite.length;
}

/** One pixel of a sprite: where it goes and what colour it is. */
export type Pixel = { x: number; y: number; colour: string };

/** Every visible pixel of a sprite, in reading order.
 *
 *  Pure, so the art can be tested without a canvas. `flip` mirrors
 *  horizontally, which is how one side-facing sprite serves both directions
 *  rather than being written out twice and drifting apart. */
export function pixelsOf(sprite: Sprite, palette: Palette, flip = false): Pixel[] {
  const out: Pixel[] = [];
  const w = widthOf(sprite);
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const key = row[x];
      if (key === TRANSPARENT || key === " ") continue;
      const colour = palette[key];
      if (!colour) continue;
      out.push({ x: flip ? w - 1 - x : x, y, colour });
    }
  });
  return out;
}

/** Draw a sprite with its top-left at (x, y), in whole pixels.
 *
 *  Runs of one colour along a row are drawn as a single rect. A character is
 *  mostly flat bands, so this turns a few hundred fillRect calls into a few
 *  dozen, and the room is redrawn every frame. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  palette: Palette,
  x: number,
  y: number,
  flip = false
): void {
  const rows = new Map<number, Pixel[]>();
  for (const p of pixelsOf(sprite, palette, flip)) {
    const row = rows.get(p.y);
    if (row) row.push(p);
    else rows.set(p.y, [p]);
  }

  for (const [rowY, pixels] of rows) {
    pixels.sort((a, b) => a.x - b.x);
    let i = 0;
    while (i < pixels.length) {
      const start = i;
      while (
        i + 1 < pixels.length &&
        pixels[i + 1].x === pixels[i].x + 1 &&
        pixels[i + 1].colour === pixels[start].colour
      ) {
        i++;
      }
      ctx.fillStyle = pixels[start].colour;
      ctx.fillRect(x + pixels[start].x, y + rowY, pixels[i].x - pixels[start].x + 1, 1);
      i++;
    }
  }
}

/** Swap one palette entry for another, for a sprite that is the same shape in
 *  a different colour. */
export function recolour(palette: Palette, changes: Palette): Palette {
  return { ...palette, ...changes };
}
