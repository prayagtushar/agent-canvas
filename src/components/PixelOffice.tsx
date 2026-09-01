import { useEffect, useRef } from "react";
import { harnessColor } from "../harness";
import { type Point } from "../office/layout";
import { place, type Errand } from "../office/place";
import {
  BOARD_PX,
  corner,
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
import {
  drawSprite,
  recolour,
  widthOf,
  type Palette,
  type Sprite,
} from "../office/pixels/raster";
import * as art from "../office/pixels/sprites";
import { catRange, pixelsOfZone, TILE as ZTILE, ZONES, zoneById } from "../office/pixels/zones";

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

const CSS_COLOUR = /^#|^rgb/;

/** Resolve a harness colour to something canvas can fill with. `harnessColor`
 *  hands back CSS custom properties, which a canvas cannot read. */
function solid(el: HTMLElement, harness: string): string {
  const raw = harnessColor(harness);
  if (CSS_COLOUR.test(raw)) return raw;
  const name = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")")).trim();
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || "#4c8dff";
}

/** Darken a hex colour, for the shadow side of a shirt. */
function darken(hex: string, by = 0.42): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - by));
  const g = Math.round(((n >> 8) & 255) * (1 - by));
  const b = Math.round((n & 255) * (1 - by));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

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
      scale = Math.max(1, Math.floor(Math.min(box.width / ROOM_PX.w, box.height / ROOM_PX.h)));
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
    let last = performance.now();
    let clock = 0;
    const range = catRange();
    const middle = { x: (range.x0 + range.x1) / 2, y: (range.y0 + range.y1) / 2 };
    const cat = { pos: { ...middle }, to: { ...middle }, wait: 2000 };

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      clock += dt;

      const { bodies: bs, edges: es } = latest.current;
      const seats = desksPx(bs.length);
      const seatOf = new Map<string, Point>();
      bs.forEach((b, i) => seats[i] && seatOf.set(b.id, seats[i]));

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawRoom(ctx, seats, es, seatOf);
      drawCat(ctx, cat, dt, clock);

      // Anyone who has left is forgotten, or the map grows all session.
      for (const id of walkers.current.keys()) {
        if (!bs.some((b) => b.id === id)) walkers.current.delete(id);
      }

      const shirt = canvas;
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
          w = { pos: { ...spot.point }, from: { ...spot.point }, to: { ...spot.point }, t: 1, ms: 1, step: 0 };
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

        drawPerson(ctx, shirt, b, w, spot.away, spot.says, clock);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
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
    const scale = box.width / ROOM_PX.w;
    const x = (e.clientX - box.left) / scale;
    const y = (e.clientY - box.top) / scale;
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

function drawRoom(
  ctx: CanvasRenderingContext2D,
  seats: Point[],
  edges: [string, string][],
  seatOf: Map<string, Point>
) {
  const P = art.PALETTE;

  // Floor: alternating tiles with a grout line between them. The grout is
  // what makes it read as a floor rather than as a checkerboard pattern —
  // without it the two tones just vibrate against each other.
  ctx.fillStyle = P["1"];
  ctx.fillRect(0, 0, ROOM_PX.w, ROOM_PX.h);
  for (let ty = 0; ty * art.TILE < ROOM_PX.h; ty++) {
    for (let tx = 0; tx * art.TILE < ROOM_PX.w; tx++) {
      if ((tx + ty) % 2 === 0) {
        ctx.fillStyle = P["2"];
        ctx.fillRect(tx * art.TILE, ty * art.TILE, art.TILE, art.TILE);
      }
    }
  }
  ctx.fillStyle = P["3"];
  for (let ty = 0; ty * art.TILE <= ROOM_PX.h; ty++) {
    ctx.fillRect(0, ty * art.TILE, ROOM_PX.w, 1);
  }
  for (let tx = 0; tx * art.TILE <= ROOM_PX.w; tx++) {
    ctx.fillRect(tx * art.TILE, 0, 1, ROOM_PX.h);
  }

  // Areas. The floor material is what divides a room into places, and it is
  // the thing the reference offices do that a single flat floor cannot.
  for (const z of ZONES) {
    const r = pixelsOfZone(z);
    if (z.id === "kitchen") {
      for (let ty = 0; ty < z.th; ty++) {
        for (let tx = 0; tx < z.tw; tx++) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? P.t : P.T;
          ctx.fillRect(r.x + tx * ZTILE, r.y + ty * ZTILE, ZTILE, ZTILE);
        }
      }
    } else {
      ctx.fillStyle = P.k;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = P.c;
      ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      for (let y = r.y + 5; y < r.y + r.h - 3; y += 4) {
        ctx.fillStyle = P.k;
        ctx.fillRect(r.x + 3, y, r.w - 6, 1);
      }
    }
    // A hairline round each area, so the edge reads as deliberate.
    ctx.strokeStyle = "rgba(8,11,18,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  // A rug under the desks, so the working area reads apart from the walkways.
  if (seats.length) {
    const xs = seats.map((s) => s.x);
    const ys = seats.map((s) => s.y);
    const x0 = Math.min(...xs) - 34;
    const x1 = Math.max(...xs) + 34;
    const y0 = Math.min(...ys) - 22;
    const y1 = Math.max(...ys) + 26;
    ctx.fillStyle = P.k;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = P.c;
    ctx.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    // A woven line every few pixels, so a large flat area still has texture.
    ctx.fillStyle = P.k;
    for (let y = y0 + 5; y < y1 - 3; y += 4) {
      ctx.fillRect(x0 + 3, y, x1 - x0 - 6, 1);
    }
  }

  // The top wall, with a lit top face and a darker front.
  ctx.fillStyle = P.W;
  ctx.fillRect(0, 0, ROOM_PX.w, 10);
  ctx.fillStyle = P.w;
  ctx.fillRect(0, 10, ROOM_PX.w, 6);
  ctx.fillStyle = P["0"];
  ctx.fillRect(0, 16, ROOM_PX.w, 1);

  // Who can see whom, on the floor between the desks.
  ctx.strokeStyle = "rgba(61,139,253,0.30)";
  ctx.lineWidth = 1;
  for (const [a, b] of edges) {
    const p = seatOf.get(a);
    const q = seatOf.get(b);
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(p.x + 0.5, p.y + 14.5);
    ctx.lineTo(q.x + 0.5, q.y + 14.5);
    ctx.stroke();
  }

  const put = (sprite: Sprite, centre: Point, dy = 0) => {
    const c = corner(centre, widthOf(sprite), sprite.length);
    drawSprite(ctx, sprite, P, c.x, c.y + dy);
  };

  put(art.MANAGER_DESK, MANAGER_PX);
  put(art.BOARD, BOARD_PX);
  put(art.SHELF, SHELF_PX);
  put(art.DOOR, DOOR_PX);
  const kitchen = zoneById("kitchen");
  if (kitchen) {
    const r = pixelsOfZone(kitchen);
    put(art.COUNTER, { x: r.x + r.w / 2, y: r.y + 12 });
    put(art.FRIDGE, { x: r.x + 14, y: r.y + 34 });
    put(art.COFFEE_MACHINE, { x: r.x + 38, y: r.y + 34 });
    put(art.COOLER, { x: r.x + r.w - 16, y: r.y + 34 });
    put(art.WALL_CLOCK, { x: r.x + r.w / 2, y: r.y - 10 });
  }

  const lounge = zoneById("lounge");
  if (lounge) {
    const r = pixelsOfZone(lounge);
    put(art.SOFA, { x: r.x + r.w / 2, y: r.y + 16 });
    put(art.LOW_TABLE, { x: r.x + r.w / 2, y: r.y + 42 });
    put(art.ARMCHAIR, { x: r.x + 14, y: r.y + 44 });
    put(art.ARMCHAIR, { x: r.x + r.w - 14, y: r.y + 44 });
    put(art.PAINTING, { x: r.x + r.w / 2, y: r.y - 12 });
    put(art.PLANT, { x: r.x + 8, y: r.y + r.h - 12 });
    put(art.PLANT, { x: r.x + r.w - 8, y: r.y + r.h - 12 });
  }

  // The rest of the room: storage down the left, greenery in the corners.
  put(art.BOOKSHELF, { x: 40, y: 74 });
  put(art.CABINET, { x: 26, y: 128 });
  put(art.BOXES, { x: 34, y: ROOM_PX.h - 90 });
  put(art.PLANT, { x: 24, y: ROOM_PX.h - 40 });
  put(art.CACTUS_POT, { x: ROOM_PX.w / 2 - 150, y: ROOM_PX.h - 40 });

  label(ctx, "YOU", MANAGER_PX.x, MANAGER_PX.y - 12);
  label(ctx, "BOARD", BOARD_PX.x, BOARD_PX.y + 26);
  label(ctx, "MEMORY", SHELF_PX.x, SHELF_PX.y + 28);
  label(ctx, "DOOR", DOOR_PX.x, DOOR_PX.y + 20);

  for (const seat of seats) {
    put(art.CHAIR, { x: seat.x, y: seat.y + 20 });
    put(art.DESK, { x: seat.x, y: seat.y + 6 });
  }

  vignette(ctx);
}

/** Darken the edges of the room, in steps rather than a gradient.
 *
 *  A smooth falloff over hard pixels reads as a rendering fault, so this is
 *  four one-pixel frames of increasing transparency: at any zoom it still
 *  looks drawn rather than filtered. */
function vignette(ctx: CanvasRenderingContext2D) {
  const steps = [0.3, 0.22, 0.15, 0.09, 0.05];
  steps.forEach((alpha, i) => {
    ctx.strokeStyle = `rgba(4,6,11,${alpha})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(i + 0.5, i + 0.5, ROOM_PX.w - i * 2 - 1, ROOM_PX.h - i * 2 - 1);
  });
}

/** The cat. Picks somewhere along the bottom of the room, ambles over, sits
 *  for a while, picks somewhere else. It stays out of the desk rows so it is
 *  never mistaken for an agent going somewhere. */
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

  const moving = gap >= 1;
  const frame = art.CAT[moving ? Math.floor(clock / 200) % art.CAT.length : 0];
  const c = corner(cat.pos, widthOf(frame), frame.length);
  drawSprite(ctx, frame, art.PALETTE, Math.round(c.x), Math.round(c.y), dx < 0);
}

/* ---------------------------------------------------------------- people -- */

function drawPerson(
  ctx: CanvasRenderingContext2D,
  host: HTMLElement,
  b: Body,
  w: Walker,
  away: boolean,
  says: string | null,
  clock: number
) {
  const base = solid(host, b.harness);
  const P: Palette = recolour(art.PALETTE, { C: base, D: darken(base) });

  const walking = w.t < 1;
  const x = Math.round(w.pos.x);
  const y = Math.round(w.pos.y);

  if (!away && !walking) {
    // At the desk. Typing while mid-turn, still otherwise.
    const monitorOn = b.status === "running";
    const screen = monitorOn ? art.PALETTE.G : art.PALETTE.L;
    const mp = recolour(P, { L: screen });
    const mc = corner({ x, y: y - 4 }, widthOf(art.MONITOR), art.MONITOR.length);
    // Light spilling onto the desk. Stepped rather than a gradient: a smooth
    // falloff among hard pixels looks like a rendering mistake.
    if (monitorOn) {
      ctx.fillStyle = "rgba(47,212,94,0.16)";
      ctx.fillRect(x - 11, y + 1, 22, 8);
      ctx.fillStyle = "rgba(47,212,94,0.13)";
      ctx.fillRect(x - 8, y + 1, 16, 10);
    }
    drawSprite(ctx, art.MONITOR, mp, mc.x, mc.y);

    const frames = monitorOn ? art.PERSON_TYPING : [art.PERSON_SITTING];
    const f = frames[Math.floor(clock / 170) % frames.length];
    const pc = corner({ x, y: y + 14 }, art.PERSON_W, f.length);
    drawSprite(ctx, f, P, pc.x, pc.y);
  } else {
    const dir = facing(w.from, w.to);
    const flip = mirrored(w.from, w.to);
    const set =
      dir === "up" ? art.PERSON_UP : dir === "down" ? art.PERSON_DOWN : art.PERSON_SIDE;
    // stand, A, stand, B — a rock rather than a march.
    const cycle = [0, 1, 0, 2];
    const frame = walking ? set[cycle[Math.floor(w.step / 120) % cycle.length]] : set[0];
    const pc = corner({ x, y }, art.PERSON_W, art.PERSON_H);
    drawSprite(ctx, frame, P, pc.x, pc.y, flip);
  }

  // A mark above the head for the thing worth noticing, and only one: a
  // character wearing three badges tells you nothing.
  const emote = b.blocked
    ? art.EMOTE_WAITING
    : away
      ? art.EMOTE_MESSAGE
      : b.unread > 0
        ? art.EMOTE_MESSAGE
        : null;
  if (emote) {
    const bob = Math.round(Math.sin(clock / 260) * 1);
    const ec = corner({ x, y: y - 16 + bob }, widthOf(emote), emote.length);
    drawSprite(ctx, emote, art.PALETTE, ec.x, ec.y);
  }

  label(ctx, b.label.toUpperCase().slice(0, 10), x, y + (away || walking ? 14 : 20), base);

  if (says) speech(ctx, says, x, y - 30);
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
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  colour = art.PALETTE["7"]
) {
  const w = textWidth(text);
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = "rgba(8,11,18,0.72)";
  ctx.fillRect(x - 2, y - 1, w + 4, GLYPH_H + 2);
  drawText(ctx, text, x, y, colour);
}

/** What an agent is carrying, in a bubble with a tail. */
function speech(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  const shown = text.toUpperCase().slice(0, 22);
  const w = textWidth(shown);
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = art.PALETTE["0"];
  ctx.fillRect(x - 4, y - 3, w + 8, GLYPH_H + 6);
  ctx.fillStyle = "#e8edf6";
  ctx.fillRect(x - 3, y - 2, w + 6, GLYPH_H + 4);
  ctx.fillRect(cx - 1, y + GLYPH_H + 2, 3, 2);
  drawText(ctx, shown, x, y, art.PALETTE["0"]);
}
