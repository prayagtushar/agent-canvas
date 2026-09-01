import { useEffect, useRef } from "react";
import { type Point } from "../office/layout";
import { place, type Errand } from "../office/place";
import {
  atlas,
  CHAR_H,
  CHAR_W,
  faceFor,
  frameAt,
  FRAMES,
  type Atlas,
  type Facing,
} from "../office/pixels/atlas";
import {
  BOARD_PX,
  DOOR_PX,
  desksPx,
  ease,
  facing,
  lerp,
  MANAGER_PX,
  mirrored,
  ROOM_PX,
  SHELF_PX,
} from "../office/pixels/scene";
import { catRange, pixelsOfZone, ZONES, zoneById } from "../office/pixels/zones";

/** The landmarks, in pixel units — the same grid the desks come back in. */
const STATIONS = {
  manager: MANAGER_PX,
  board: BOARD_PX,
  shelf: SHELF_PX,
  door: DOOR_PX,
};

/** One agent, as far as the renderer is concerned. */
export type Body = {
  id: string;
  label: string;
  harness: string;
  status: string;
  blocked: boolean;
  errand: Errand | null;
  unread: number;
};

/** Where a character actually is on screen, which lags where it should be.
 *  Kept in a ref rather than in React state: this changes sixty times a second
 *  and nothing outside the canvas cares. */
type Walker = {
  pos: Point;
  from: Point;
  to: Point;
  /** 0 while setting off, 1 on arrival. */
  t: number;
  ms: number;
  step: number;
};

export default function PixelOffice({
  bodies,
  edges,
  onPeek,
  onSelect,
}: {
  bodies: Body[];
  edges: [string, string][];
  onPeek: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const walkers = useRef(new Map<string, Walker>());
  // The draw loop reads these rather than closing over a render's props, so a
  // re-render does not restart the animation.
  const latest = useRef({ bodies, edges });
  latest.current = { bodies, edges };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let scale = 1;
    const fit = () => {
      const box = wrap.getBoundingClientRect();
      // Whole numbers only. A pixel drawn at 2.3x has soft edges, which is the
      // one thing pixel art cannot survive.
      scale = Math.max(
        1,
        Math.floor(Math.min(box.width / ROOM_PX.w, box.height / ROOM_PX.h))
      );
      canvas.width = ROOM_PX.w * scale;
      canvas.height = ROOM_PX.h * scale;
      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
      ctx.imageSmoothingEnabled = false;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    let raf = 0;
    let alive = true;
    let art: Atlas | null = null;
    void atlas().then((a) => {
      if (alive) art = a;
    });

    let last = performance.now();
    let clock = 0;
    const range = catRange();
    const middle = { x: (range.x0 + range.x1) / 2, y: (range.y0 + range.y1) / 2 };
    const cat = { pos: { ...middle }, to: { ...middle }, wait: 2000 };

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      clock += dt;
      raf = requestAnimationFrame(draw);

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      // Decoding takes a frame or two. Painting the floor colour meanwhile
      // beats a white flash.
      ctx.fillStyle = "#1e2634";
      ctx.fillRect(0, 0, ROOM_PX.w, ROOM_PX.h);
      if (!art) return;

      const { bodies: bs, edges: es } = latest.current;
      const seats = desksPx(bs.length);
      const seatOf = new Map<string, Point>();
      bs.forEach((b, i) => seats[i] && seatOf.set(b.id, seats[i]));

      drawRoom(ctx, art, seats, es, seatOf);
      drawCat(ctx, cat, dt, clock);

      // Anyone who has left is forgotten, or the map grows all session.
      for (const id of walkers.current.keys()) {
        if (!bs.some((b) => b.id === id)) walkers.current.delete(id);
      }

      // Back to front, so a character lower down overlaps one behind it.
      const order = bs
        .map((b, i) => ({ b, seat: seats[i] }))
        .filter((x) => x.seat)
        .sort((a, b) => a.seat.y - b.seat.y);

      for (const { b, seat } of order) {
        const spot = place({
          desk: seat,
          blocked: b.blocked,
          errand: b.errand,
          deskOf: (id) => seatOf.get(id),
          stations: STATIONS,
        });

        let w = walkers.current.get(b.id);
        if (!w) {
          w = {
            pos: { ...spot.point },
            from: { ...spot.point },
            to: { ...spot.point },
            t: 1,
            ms: 1,
            step: 0,
          };
          walkers.current.set(b.id, w);
        }
        if (w.to.x !== spot.point.x || w.to.y !== spot.point.y) {
          w.from = { ...w.pos };
          w.to = { ...spot.point };
          w.t = 0;
          const d = Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y);
          w.ms = Math.min(1400, Math.max(320, d * 9));
        }
        if (w.t < 1) {
          w.t = Math.min(1, w.t + dt / w.ms);
          w.pos = lerp(w.from, w.to, ease(w.t));
          w.step += dt;
        }

        drawPerson(ctx, art, b, w, spot.away, spot.says, clock);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /** Hit test in room coordinates: the nearest character within a desk's
   *  reach, so hovering roughly at somebody counts. */
  const at = (e: React.MouseEvent): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const s = box.width / ROOM_PX.w;
    const x = (e.clientX - box.left) / s;
    const y = (e.clientY - box.top) / s;
    let best: { id: string; d: number } | null = null;
    for (const [id, w] of walkers.current) {
      const d = Math.hypot(w.pos.x - x, w.pos.y - y);
      if (d < 18 && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  };

  return (
    <div className="pixel-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="pixel-canvas"
        onMouseMove={(e) => onPeek(at(e))}
        onMouseLeave={() => onPeek(null)}
        onClick={(e) => {
          const id = at(e);
          if (id) onSelect(id);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ room -- */

/** Draw an image with its centre at a point, on whole pixels. */
function put(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number
) {
  ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
}

/** Fill a rectangle by repeating a tile and multiplying it by a colour.
 *
 *  The tiles are greyscale masters; the tint is what makes one a wood floor
 *  and another a kitchen. Multiply keeps the grout and the grain, which a flat
 *  fill over the top would bury, and clipping keeps the tint inside the area
 *  rather than over the whole room. */
function surface(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  tint: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  for (let ty = 0; ty < h; ty += img.height) {
    for (let tx = 0; tx < w; tx += img.width) {
      const cw = Math.min(img.width, w - tx);
      const ch = Math.min(img.height, h - ty);
      ctx.drawImage(img, 0, 0, cw, ch, x + tx, y + ty, cw, ch);
    }
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  art: Atlas,
  seats: Point[],
  edges: [string, string][],
  seatOf: Map<string, Point>
) {
  // The floor everywhere, then the areas over it. Floor material is what
  // divides a room into places; without it a room is a diagram with props.
  surface(ctx, art.surfaces.main, art.tints.main, 0, 0, ROOM_PX.w, ROOM_PX.h);

  for (const z of ZONES) {
    const r = pixelsOfZone(z);
    const kit = z.id === "kitchen";
    surface(
      ctx,
      kit ? art.surfaces.kitchen : art.surfaces.lounge,
      kit ? art.tints.kitchen : art.tints.lounge,
      r.x,
      r.y,
      r.w,
      r.h
    );
  }

  // The carpet under the desks, sized to them.
  if (seats.length) {
    const xs = seats.map((s) => s.x);
    const ys = seats.map((s) => s.y);
    const x0 = Math.round(Math.min(...xs) - 40);
    const x1 = Math.round(Math.max(...xs) + 40);
    const y0 = Math.round(Math.min(...ys) - 28);
    const y1 = Math.round(Math.max(...ys) + 32);
    surface(ctx, art.surfaces.desks, art.tints.desks, x0, y0, x1 - x0, y1 - y0);
  }

  // Who can see whom, on the floor between the desks.
  ctx.strokeStyle = "rgba(61,139,253,0.34)";
  ctx.lineWidth = 1;
  for (const [a, b] of edges) {
    const p = seatOf.get(a);
    const q = seatOf.get(b);
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(p.x + 0.5, p.y + 18.5);
    ctx.lineTo(q.x + 0.5, q.y + 18.5);
    ctx.stroke();
  }

  // Your desk, and the fixtures the agents walk to.
  put(ctx, art.desk, MANAGER_PX.x, MANAGER_PX.y);
  put(ctx, art.whiteboard, BOARD_PX.x, BOARD_PX.y);
  put(ctx, art.doubleBookshelf, SHELF_PX.x, SHELF_PX.y);
  put(ctx, art.bin, DOOR_PX.x, DOOR_PX.y);

  const kitchen = zoneById("kitchen");
  if (kitchen) {
    const r = pixelsOfZone(kitchen);
    put(ctx, art.coffee, r.x + 14, r.y + 16);
    put(ctx, art.clock, r.x + r.w - 14, r.y + 16);
    put(ctx, art.table, r.x + r.w / 2, r.y + r.h - 18);
    put(ctx, art.plant, r.x + r.w - 12, r.y + r.h - 12);
  }

  const lounge = zoneById("lounge");
  if (lounge) {
    const r = pixelsOfZone(lounge);
    put(ctx, art.sofa, r.x + r.w / 2, r.y + 12);
    put(ctx, art.table, r.x + r.w / 2, r.y + r.h - 20);
    put(ctx, art.painting, r.x + r.w / 2, r.y - 10);
    put(ctx, art.largePlant, r.x + 12, r.y + r.h - 14);
  }

  // The rest of the room.
  put(ctx, art.bookshelf, 46, 58);
  put(ctx, art.bookshelf, 46, 74);
  put(ctx, art.largePlant, 26, ROOM_PX.h - 54);
  put(ctx, art.cactus, ROOM_PX.w / 2 - 136, ROOM_PX.h - 40);
  put(ctx, art.plant, ROOM_PX.w / 2 + 136, ROOM_PX.h - 40);

  // Each desk, with its chair behind it.
  for (const seat of seats) {
    put(ctx, art.chair, seat.x, seat.y + 28);
    put(ctx, art.desk, seat.x, seat.y + 10);
  }

  vignette(ctx);
}

/** Darken the edges of the room, in steps rather than a gradient.
 *
 *  A smooth falloff over hard pixels reads as a rendering fault, so this is a
 *  few one-pixel frames of increasing transparency: at any zoom it still looks
 *  drawn rather than filtered. */
function vignette(ctx: CanvasRenderingContext2D) {
  const steps = [0.3, 0.22, 0.15, 0.09, 0.05];
  steps.forEach((alpha, i) => {
    ctx.strokeStyle = `rgba(4,6,11,${alpha})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(i + 0.5, i + 0.5, ROOM_PX.w - i * 2 - 1, ROOM_PX.h - i * 2 - 1);
  });
}

/** The cat. Ambles around the lounge, sits, picks somewhere else. It means
 *  nothing, which is exactly why it is a cat and not a character: agent
 *  movement in this room is always evidence something happened. */
function drawCat(
  ctx: CanvasRenderingContext2D,
  cat: { pos: Point; to: Point; wait: number },
  dt: number,
  clock: number
) {
  cat.wait -= dt;
  const dx = cat.to.x - cat.pos.x;
  const dy = cat.to.y - cat.pos.y;
  const gap = Math.hypot(dx, dy);

  if (gap < 1) {
    if (cat.wait <= 0) {
      const r = catRange();
      cat.to = {
        x: r.x0 + Math.random() * (r.x1 - r.x0),
        y: r.y0 + Math.random() * (r.y1 - r.y0),
      };
      cat.wait = 2600 + Math.random() * 5200;
    }
  } else {
    const step = Math.min(gap, (dt / 1000) * 15);
    cat.pos = { x: cat.pos.x + (dx / gap) * step, y: cat.pos.y + (dy / gap) * step };
  }

  const walking = gap >= 1;
  const x = Math.round(cat.pos.x);
  const y = Math.round(cat.pos.y) - (walking && Math.floor(clock / 200) % 2 ? 1 : 0);
  ctx.fillStyle = "#241d16";
  ctx.fillRect(x - 3, y - 2, 6, 4);
  ctx.fillRect(x - 3, y - 4, 1, 2);
  ctx.fillRect(x + 2, y - 4, 1, 2);
  ctx.fillRect(x + (dx < 0 ? -5 : 3), y - 3, 2, 1);
}

/* ---------------------------------------------------------------- people -- */

function drawPerson(
  ctx: CanvasRenderingContext2D,
  art: Atlas,
  b: Body,
  w: Walker,
  away: boolean,
  says: string | null,
  clock: number
) {
  const sheet = art.characters[faceFor(b.id, art.characters.length)];
  const walking = w.t < 1;
  const x = Math.round(w.pos.x);
  const y = Math.round(w.pos.y);

  let face: Facing;
  let frame: number;

  if (!away && !walking) {
    // At the desk, facing the monitor, which is up the screen from here.
    face = "up";
    frame =
      b.status === "running"
        ? FRAMES.typing[Math.floor(clock / 170) % FRAMES.typing.length]
        : FRAMES.idle;
    const screen =
      b.status === "running"
        ? art.pc.on[Math.floor(clock / 220) % art.pc.on.length]
        : art.pc.off;
    put(ctx, screen, x, y - 2);
  } else {
    const dir = facing(w.from, w.to);
    face = dir === "side" ? (mirrored(w.from, w.to) ? "left" : "right") : dir;
    frame = walking
      ? FRAMES.walk[Math.floor(w.step / 130) % FRAMES.walk.length]
      : FRAMES.idle;
  }

  drawFrame(ctx, sheet, face, frame, x, y + 10);

  // One mark above the head, for the thing worth noticing. A character
  // wearing three badges tells you nothing.
  const bob = Math.round(Math.sin(clock / 260));
  if (b.blocked) mark(ctx, x, y - 30 + bob, "#febc2e", "!");
  else if (away) mark(ctx, x, y - 30 + bob, "#d8b4fe", ">");
  else if (b.unread > 0) {
    mark(ctx, x, y - 30 + bob, "#d8b4fe", String(Math.min(9, b.unread)));
  }

  label(ctx, b.label.toUpperCase().slice(0, 10), x, y + 16);

  if (says) speech(ctx, says, x, y - 44);
}

/** One frame of a character sheet, mirrored if it is a left-facing pose.
 *  The sprite stands on its feet: the point given is where the feet are. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  face: Facing,
  frame: number,
  cx: number,
  feetY: number
) {
  const { sx, sy, flip } = frameAt(face, frame);
  const x = Math.round(cx - CHAR_W / 2);
  const y = Math.round(feetY - CHAR_H);
  if (!flip) {
    ctx.drawImage(sheet, sx, sy, CHAR_W, CHAR_H, x, y, CHAR_W, CHAR_H);
    return;
  }
  ctx.save();
  ctx.translate(x + CHAR_W, y);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet, sx, sy, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
  ctx.restore();
}

/** A small square badge over a head. */
function mark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colour: string,
  glyph: string
) {
  ctx.fillStyle = "#080b12";
  ctx.fillRect(cx - 5, cy - 5, 10, 10);
  ctx.fillStyle = colour;
  ctx.fillRect(cx - 4, cy - 4, 8, 8);
  drawText(ctx, glyph, cx - 1, cy - 2, "#14171e");
}

/* ------------------------------------------------------------------ text --
   Canvas text at this scale would be a blurry smear, so labels are drawn in a
   tiny bitmap font: three pixels wide, five tall, which is the smallest that
   stays readable. Only the characters a name or a label can contain. */

const GLYPHS: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "110", "100", "110", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "011"],
  V: ["101", "101", "101", "010", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"],
  "3": ["110", "001", "010", "001", "110"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "110", "101", "010"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["010", "101", "010", "101", "010"],
  "9": ["010", "101", "011", "001", "110"],
  "-": ["000", "000", "111", "000", "000"],
  ">": ["100", "010", "001", "010", "100"],
  ".": ["000", "000", "000", "000", "010"],
  "?": ["110", "001", "010", "000", "010"],
  "!": ["010", "010", "010", "000", "010"],
  "'": ["010", "010", "000", "000", "000"],
  ":": ["000", "010", "000", "010", "000"],
  " ": ["000", "000", "000", "000", "000"],
};

const GLYPH_W = 4;
const GLYPH_H = 5;

export function textWidth(text: string): number {
  return text.length * GLYPH_W - 1;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string
) {
  ctx.fillStyle = colour;
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS["?"];
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = g[gy];
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] === "1") ctx.fillRect(cx + gx, y + gy, 1, 1);
      }
    }
    cx += GLYPH_W;
  }
}

/** A centred label with a dark backing, so a name stays readable over a rug
 *  or a desk. */
function label(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  const w = textWidth(text);
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = "rgba(8,11,18,0.78)";
  ctx.fillRect(x - 2, y - 1, w + 4, GLYPH_H + 2);
  drawText(ctx, text, x, y, "#c6d2e4");
}

/** What an agent is carrying, in a bubble with a tail. */
function speech(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  const shown = text.toUpperCase().slice(0, 22);
  const w = textWidth(shown);
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = "#080b12";
  ctx.fillRect(x - 4, y - 3, w + 8, GLYPH_H + 6);
  ctx.fillStyle = "#e8edf6";
  ctx.fillRect(x - 3, y - 2, w + 6, GLYPH_H + 4);
  ctx.fillRect(cx - 1, y + GLYPH_H + 2, 3, 2);
  drawText(ctx, shown, x, y, "#080b12");
}
