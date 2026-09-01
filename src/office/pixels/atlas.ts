/** Loading the sprite sheets.
 *
 *  Vite turns these imports into URLs and copies the files into the bundle, so
 *  the app still has no network dependency: they are served from the same
 *  place as the rest of the frontend.
 *
 *  Everything here is decoded once and held. The office redraws sixty times a
 *  second and a `drawImage` from a decoded bitmap is cheap; decoding one is
 *  not. See CREDITS.md for where the art came from and under what terms. */

import char0 from "./assets/characters/char_0.png";
import char1 from "./assets/characters/char_1.png";
import char2 from "./assets/characters/char_2.png";
import char3 from "./assets/characters/char_3.png";
import char4 from "./assets/characters/char_4.png";
import char5 from "./assets/characters/char_5.png";

/* Surfaces are imported by the job they do, not by their filename.
   The pack's nine "floors" are all neutral greys — tile, brick, checker — and
   the warm plank surfaces are in "carpets". Naming them after their role is
   the only way the renderer reads sensibly. */
import surfaceMain from "./assets/carpets/carpet_0.png";
import surfaceDesks from "./assets/carpets/carpet_1.png";
import surfaceLounge from "./assets/carpets/carpet_2.png";
import surfaceKitchen from "./assets/floors/floor_1.png";

import deskFront from "./assets/furniture/DESK/DESK_FRONT.png";
import pcOff from "./assets/furniture/PC/PC_FRONT_OFF.png";
import pcOn1 from "./assets/furniture/PC/PC_FRONT_ON_1.png";
import pcOn2 from "./assets/furniture/PC/PC_FRONT_ON_2.png";
import pcOn3 from "./assets/furniture/PC/PC_FRONT_ON_3.png";
import chairBack from "./assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_BACK.png";
import bookshelf from "./assets/furniture/BOOKSHELF/BOOKSHELF.png";
import doubleBookshelf from "./assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png";
import plant from "./assets/furniture/PLANT/PLANT.png";
import largePlant from "./assets/furniture/LARGE_PLANT/LARGE_PLANT.png";
import cactus from "./assets/furniture/CACTUS/CACTUS.png";
import sofaFront from "./assets/furniture/SOFA/SOFA_FRONT.png";
import smallTable from "./assets/furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png";
import painting from "./assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png";
import whiteboard from "./assets/furniture/WHITEBOARD/WHITEBOARD.png";
import clock from "./assets/furniture/CLOCK/CLOCK.png";
import coffee from "./assets/furniture/COFFEE/COFFEE.png";
import bin from "./assets/furniture/BIN/BIN.png";

/** One frame of a character sheet. */
export const CHAR_W = 16;
export const CHAR_H = 32;
export const CHAR_PER_ROW = 7;

/** Rows of a character sheet, in order. Left is the right row, mirrored: the
 *  pack does not draw one and flipping keeps the two from disagreeing. */
export const CHAR_ROWS = { down: 0, up: 1, right: 2 } as const;
export type Facing = keyof typeof CHAR_ROWS | "left";

/** Which frames mean what, read off Pixel Agents' own sprite loader rather
 *  than guessed at. Walking cycles 0,1,2,1 so it rocks instead of marching,
 *  and frame 1 is the one to stand still on. */
export const FRAMES = {
  walk: [0, 1, 2, 1],
  idle: 1,
  typing: [3, 4],
  reading: [5, 6],
} as const;

export type Atlas = {
  characters: HTMLImageElement[];
  surfaces: {
    /** The floor of the room as a whole. */
    main: HTMLImageElement;
    /** Under the desks, so the work area reads apart from the walkways. */
    desks: HTMLImageElement;
    kitchen: HTMLImageElement;
    lounge: HTMLImageElement;
  };
  desk: HTMLImageElement;
  pc: { off: HTMLImageElement; on: HTMLImageElement[] };
  chair: HTMLImageElement;
  bookshelf: HTMLImageElement;
  doubleBookshelf: HTMLImageElement;
  plant: HTMLImageElement;
  largePlant: HTMLImageElement;
  cactus: HTMLImageElement;
  sofa: HTMLImageElement;
  table: HTMLImageElement;
  painting: HTMLImageElement;
  whiteboard: HTMLImageElement;
  clock: HTMLImageElement;
  coffee: HTMLImageElement;
  bin: HTMLImageElement;
};

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => fail(new Error(`could not load ${src}`));
    img.src = src;
  });
}

let pending: Promise<Atlas> | null = null;

/** Load everything once. Repeat callers get the same promise, so opening and
 *  closing the office does not decode the art again. */
export function atlas(): Promise<Atlas> {
  if (pending) return pending;
  pending = (async () => {
    const [
      c0, c1, c2, c3, c4, c5,
      sMain, sDesks, sLounge, sKitchen,
      desk, off, on1, on2, on3, chair,
      shelf, dshelf, pl, lpl, cac,
      sofa, table, paint, board, clk, cof, bn,
    ] = await Promise.all([
      load(char0), load(char1), load(char2), load(char3), load(char4), load(char5),
      load(surfaceMain), load(surfaceDesks), load(surfaceLounge), load(surfaceKitchen),
      load(deskFront), load(pcOff), load(pcOn1), load(pcOn2), load(pcOn3), load(chairBack),
      load(bookshelf), load(doubleBookshelf), load(plant), load(largePlant), load(cactus),
      load(sofaFront), load(smallTable), load(painting), load(whiteboard), load(clock),
      load(coffee), load(bin),
    ]);
    return {
      characters: [c0, c1, c2, c3, c4, c5],
      surfaces: { main: sMain, desks: sDesks, kitchen: sKitchen, lounge: sLounge },
      desk,
      pc: { off, on: [on1, on2, on3] },
      chair,
      bookshelf: shelf,
      doubleBookshelf: dshelf,
      plant: pl,
      largePlant: lpl,
      cactus: cac,
      sofa,
      table,
      painting: paint,
      whiteboard: board,
      clock: clk,
      coffee: cof,
      bin: bn,
    };
  })();
  return pending;
}

/** Which of the six characters an agent gets.
 *
 *  From the node id rather than from its position in the list, so an agent
 *  keeps the same face when somebody above it is removed. Six characters and
 *  more than six agents means repeats; the name tag underneath is what
 *  actually identifies them. */
export function faceFor(nodeId: string, count = 6): number {
  let h = 0;
  for (let i = 0; i < nodeId.length; i++) {
    h = (h * 31 + nodeId.charCodeAt(i)) >>> 0;
  }
  return h % count;
}

/** Where a frame sits on a sheet, and whether to mirror it. */
export function frameAt(facing: Facing, frame: number): {
  sx: number;
  sy: number;
  flip: boolean;
} {
  const flip = facing === "left";
  const row = CHAR_ROWS[flip ? "right" : (facing as keyof typeof CHAR_ROWS)];
  return { sx: (frame % CHAR_PER_ROW) * CHAR_W, sy: row * CHAR_H, flip };
}
