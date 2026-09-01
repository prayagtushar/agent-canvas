import type { Palette, Sprite } from "./raster";

/** The art.
 *
 *  A tight ramp on purpose. Pixel art falls apart with too many colours: the
 *  eye reads shape from a few steps of value, and every extra tone makes the
 *  shape muddier rather than richer. Two darks, two mids, two lights, and the
 *  harness colour for the one thing that has to be identifiable across the
 *  room — which agent this is.
 *
 *  Keys are single characters so a sprite stays legible as text. Anything that
 *  wants recolouring per agent uses `C` for the main tone and `D` for its
 *  shadow, and `recolour()` swaps just those two. */

export const TILE = 16;

/** Character height, used for anchoring anything that floats above a head. */
export const PERSON_H = 16;
export const PERSON_W = 12;

export const PALETTE: Palette = {
  // room
  "0": "#080b12", // outline, near black
  "1": "#1e2634", // floor tile
  "2": "#222b3b", // floor tile, the other one
  "3": "#182030", // grout between tiles
  "4": "#4a3628", // desk wood, dark
  "5": "#6b4a35", // desk wood
  "6": "#8a6244", // desk wood, lit edge
  "7": "#9fb3cc", // metal / highlight
  w: "#2f3b55", // wall face
  W: "#43526f", // wall top
  // person
  S: "#e8b892", // skin
  s: "#c99771", // skin shadow
  H: "#2a2118", // hair
  E: "#0b0f16", // eye
  P: "#243040", // trousers
  B: "#161d28", // shoes
  C: "#4c8dff", // shirt, swapped per harness
  D: "#2f5cad", // shirt shadow, swapped per harness
  // accents
  G: "#2fd45e", // screen on / live
  g: "#1c8f3f",
  Y: "#febc2e", // waiting
  R: "#ff5f57",
  p: "#d8b4fe", // peer traffic
  L: "#8fe3ff", // screen glow
  n: "#3a7d4a", // plant dark
  N: "#4fae63", // plant
  o: "#7a5236", // pot
  c: "#25404c", // carpet
  k: "#1a2e37", // carpet edge
  t: "#3b4152", // kitchen tile
  T: "#333949", // kitchen tile, the other one
  a: "#b9c4d4", // appliance
  A: "#7e8899", // appliance shadow
  f: "#7c4a52", // upholstery
  F: "#5a343b", // upholstery shadow
};

/* ---------------------------------------------------------------- people --
   Twelve wide, sixteen tall. Small enough that a roomful reads as a crowd,
   big enough that the harness colour on the torso is unmistakable.

   Three frames per direction: a stand and two steps. The cycle runs
   stand, A, stand, B so a walk rocks rather than marching, which is the
   cheapest way to make four frames look like eight. */

export const PERSON_DOWN: Sprite[] = [
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HSSSSSSH..",
    "..SSSSSSSS..",
    "..SEsssSES..",
    "..SSSSSSSS..",
    "...SSssSS...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SC CCCC CS.",
    "...PPPPPP...",
    "...PP..PP...",
    "...BB..BB...",
  ],
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HSSSSSSH..",
    "..SSSSSSSS..",
    "..SEsssSES..",
    "..SSSSSSSS..",
    "...SSssSS...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SC CCCC CS.",
    "...PPPPPP...",
    "..PP...PP...",
    "..BB....BB..",
  ],
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HSSSSSSH..",
    "..SSSSSSSS..",
    "..SEsssSES..",
    "..SSSSSSSS..",
    "...SSssSS...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SC CCCC CS.",
    "...PPPPPP...",
    "...PP...PP..",
    "...BB....BB.",
  ],
];

/** From behind: no face, and the hair covers more of the head. */
export const PERSON_UP: Sprite[] = [
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..sHHHHHHs..",
    "..ssssssss..",
    "...ssssss...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SC CCCC CS.",
    "...PPPPPP...",
    "...PP..PP...",
    "...BB..BB...",
  ],
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..sHHHHHHs..",
    "..ssssssss..",
    "...ssssss...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SC CCCC CS.",
    "...PPPPPP...",
    "..PP...PP...",
    "..BB....BB..",
  ],
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..sHHHHHHs..",
    "..ssssssss..",
    "...ssssss...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SC CCCC CS.",
    "...PPPPPP...",
    "...PP...PP..",
    "...BB....BB.",
  ],
];

/** Facing right. Mirrored at draw time for facing left, so the two can never
 *  drift apart. */
export const PERSON_SIDE: Sprite[] = [
  [
    "...HHHH.....",
    "..HHHHHH....",
    "..HHHHHHH...",
    "..HHSSSSS...",
    "..HSSSSSS...",
    "..sSSSES....",
    "...SSSSS....",
    "....SSss....",
    "....CCCC....",
    "...CCCCCC...",
    "...CCCCCCS..",
    "...CCDCCCS..",
    "...CCCCCC...",
    "....PPPP....",
    "....PP.PP...",
    "....BB.BB...",
  ],
  [
    "...HHHH.....",
    "..HHHHHH....",
    "..HHHHHHH...",
    "..HHSSSSS...",
    "..HSSSSSS...",
    "..sSSSES....",
    "...SSSSS....",
    "....SSss....",
    "....CCCC....",
    "...CCCCCC...",
    "...CCCCCCS..",
    "...CCDCCCS..",
    "...CCCCCC...",
    "....PPPP....",
    "...PP..PP...",
    "...BB...BB..",
  ],
  [
    "...HHHH.....",
    "..HHHHHH....",
    "..HHHHHHH...",
    "..HHSSSSS...",
    "..HSSSSSS...",
    "..sSSSES....",
    "...SSSSS....",
    "....SSss....",
    "....CCCC....",
    "...CCCCCC...",
    "...CCCCCCS..",
    "...CCDCCCS..",
    "...CCCCCC...",
    "....PPPP....",
    ".....PPP....",
    "....BBBB....",
  ],
];

/** Sitting at a desk, seen from behind: the pose the room is mostly in.
 *  Shorter than a standing figure, because the chair takes the legs. */
export const PERSON_SITTING: Sprite = [
  "....HHHH....",
  "...HHHHHH...",
  "..HHHHHHHH..",
  "..HHHHHHHH..",
  "..HHHHHHHH..",
  "..sHHHHHHs..",
  "..ssssssss..",
  "...ssssss...",
  "....CCCC....",
  "..CCCCCCCC..",
  ".CCCCCCCCCC.",
  ".CCDCCCCDCC.",
  ".SCCCCCCCCS.",
  "..4444444...",
];

/** Hands moving at a keyboard. Two frames, alternated fast. */
export const PERSON_TYPING: Sprite[] = [
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..sHHHHHHs..",
    "..ssssssss..",
    "...ssssss...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    "SCCCCCCCCCCS",
    "..4444444...",
  ],
  [
    "....HHHH....",
    "...HHHHHH...",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..HHHHHHHH..",
    "..sHHHHHHs..",
    "..ssssssss..",
    "...ssssss...",
    "....CCCC....",
    "..CCCCCCCC..",
    ".CCCCCCCCCC.",
    ".CCDCCCCDCC.",
    ".SCCCCCCCCS.",
    "..4444444...",
  ],
];

/* ------------------------------------------------------------- furniture -- */

/** A desk with a monitor on it, seen from above and slightly in front.
 *  The screen is `L`, swapped for green while the agent is mid-turn. */
export const DESK: Sprite = [
  "..0000000000000000000000..",
  ".044444444444444444444440.",
  ".045555555555555555555540.",
  ".045000000000000000005540.",
  ".045077777777777777705540.",
  ".045077777777777777705540.",
  ".045077777777777777705540.",
  ".045000000000000000005540.",
  ".044444444444444444444440.",
  "..0000000000000000000000..",
];

/** The monitor that stands on the desk. Drawn separately so its screen can
 *  change colour without redrawing the desk. */
export const MONITOR: Sprite = [
  ".0000000000.",
  ".0LLLLLLLL0.",
  ".0LLLLLLLL0.",
  ".0LLLLLLLL0.",
  ".0LLLLLLLL0.",
  ".0LLLLLLLL0.",
  ".0000000000.",
  "....0440....",
  "...044440...",
  "..0000000...",
];

export const CHAIR: Sprite = [
  "..444444..",
  ".45555554.",
  ".45555554.",
  ".45555554.",
  "..444444..",
  "....44....",
  "...4004...",
];

/** The shared task board, hung on a wall. The pale marks are cards. */
export const BOARD: Sprite = [
  "0000000000000000",
  "0666666666666660",
  "0644444444444460",
  "064LL0LL0LLL0460",
  "064LL0LL0LLL0460",
  "0644444444444460",
  "064LLL0LL0LL04600",
  "064LLL0LL0LL0460",
  "0644444444444460",
  "0666666666666660",
  "0000000000000000",
];

/** Shared memory: a bookshelf. */
export const SHELF: Sprite = [
  "000000000000",
  "066666666660",
  "064p4G4Y4L40",
  "064p4G4Y4L40",
  "066666666660",
  "064L4p4G4Y40",
  "064L4p4G4Y40",
  "066666666660",
  "064Y4L4p4G40",
  "064Y4L4p4G40",
  "066666666660",
  "000000000000",
];

export const DOOR: Sprite = [
  "000000000000",
  "066666666660",
  "064444444460",
  "064555555460",
  "064555555460",
  "064555554460",
  "0645555Y5460",
  "064555555460",
  "064555555460",
  "064444444460",
  "066666666660",
  "000000000000",
];

/** Your desk: wider, and the only furniture with the accent colour on it. */
export const MANAGER_DESK: Sprite = [
  "..00000000000000000000000000000000..",
  ".0444444444444444444444444444444440.",
  ".0455555555555555555555555555555540.",
  ".0456666666666666666666666666666540.",
  ".0456CCCCCCCCCCCCCCCCCCCCCCCCCC6540.",
  ".0456666666666666666666666666666540.",
  ".0455555555555555555555555555555540.",
  ".0444444444444444444444444444444440.",
  "..00000000000000000000000000000000..",
];

export const PLANT: Sprite = [
  "...NN...",
  "..NNNN..",
  ".NNnNNN.",
  "NNNnnNNN",
  ".NNnNNN.",
  "..NnN...",
  "...n....",
  "..oooo..",
  "..oooo..",
  "...oo...",
];

/** A rug under the desks, to break up the floor. Drawn as a tile that
 *  repeats. */
export const RUG_TILE: Sprite = [
  "3333333333333333",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3222222222222223",
  "3333333333333333",
];

/* ---------------------------------------------------------------- emotes --
   Small marks that float above a head. Copied in spirit from the office sims
   that put an icon over each character, but each of these stands for a Bus
   event rather than a guess at what the agent is doing. */

/** Blocked on you. */
export const EMOTE_WAITING: Sprite = [
  "..YYYYYY..",
  ".YYYYYYYY.",
  "YYY0000YYY",
  "YYYY00YYYY",
  "YYYY00YYYY",
  "YYYYY0YYYY",
  "YYYY00YYYY",
  "YYYY00YYYY",
  "YYYY00YYYY",
  "YYYY00YYYY",
  "YYYYYYYYYY",
  "YYYY00YYYY",
  ".YYYYYYYY.",
  "..YYYYYY..",
];

/** Carrying a message. */
export const EMOTE_MESSAGE: Sprite = [
  "pppppppppp",
  "p00000000p",
  "p0pppppp0p",
  "p0p0000p0p",
  "p0pp00pp0p",
  "p0ppp0ppp0",
  "p0pppppp0p",
  "p00000000p",
  "pppppppppp",
  "...pp.....",
  "..pp......",
];

/** Working: a small pulse of screen light. */
export const EMOTE_TYPING: Sprite = [
  "..GGGGGG..",
  ".GGGGGGGG.",
  "GG000000GG",
  "GG0GGGG0GG",
  "GG0G00G0GG",
  "GG0G00G0GG",
  "GG0GGGG0GG",
  "GG000000GG",
  ".GGGGGGGG.",
  "..GGGGGG..",
];

/* ------------------------------------------------------- the rest of it --
   An office is mostly not desks. These are here so the room reads as a place
   rather than a diagram with furniture on it, and so the walkways between the
   desks have something to be walkways between. */

export const COOLER: Sprite = [
  "..0000..",
  ".0LLLL0.",
  ".0LLLL0.",
  ".0LLLL0.",
  ".066660.",
  ".045540.",
  ".045540.",
  ".045540.",
  ".044440.",
  "..0000..",
];

export const CABINET: Sprite = [
  "0000000000",
  "0666666660",
  "0644444460",
  "0647777460",
  "0644444460",
  "0666666660",
  "0644444460",
  "0647777460",
  "0644444460",
  "0666666660",
  "0000000000",
];

export const COUCH: Sprite = [
  "000000000000000000",
  "066666666666666660",
  "064444444444444460",
  "065555555555555550",
  "065555555555555550",
  "064444444444444460",
  "066666666666666660",
  "0.0............0.0",
];

/** A pet. Both of the office sims this borrows from have one, and they are
 *  right: a room where the only thing that moves is an agent is a diagram.
 *  It wanders on a timer and means nothing, which is exactly why it is a cat
 *  and not a character. */
export const CAT: Sprite[] = [
  [
    ".H..H.",
    "HHHHHH",
    "HEHHEH",
    "HHHHHH",
    ".HHHH.",
    "HHHHHH",
    ".H..H.",
  ],
  [
    ".H..H.",
    "HHHHHH",
    "HEHHEH",
    "HHHHHH",
    ".HHHH.",
    "HHHHHH",
    "H....H",
  ],
];

/* -------------------------------------------------------- the kitchen -- */

export const FRIDGE: Sprite = [
  "0000000000",
  "0aaaaaaaa0",
  "0aAAAAAAa0",
  "0aAAAAAAa0",
  "0aAAAAAa70",
  "0aaaaaaaa0",
  "0aAAAAAAa0",
  "0aAAAAAAa0",
  "0aAAAAAa70",
  "0aAAAAAAa0",
  "0aaaaaaaa0",
  "0000000000",
];

export const COFFEE_MACHINE: Sprite = [
  "00000000",
  "0444440.",
  "04LLL40.",
  "04LLL40.",
  "0444440.",
  "04aaa40.",
  "04a5a40.",
  "0444440.",
  "00000000",
];

export const COUNTER: Sprite = [
  "000000000000000000000000",
  "066666666666666666666660",
  "065555555555555555555560",
  "064444444444444444444460",
  "064400444004440044400460",
  "064444444444444444444460",
  "066666666666666666666660",
  "000000000000000000000000",
];

/* --------------------------------------------------------- the lounge -- */

export const SOFA: Sprite = [
  "0000000000000000000000",
  "0ffffffffffffffffffff0",
  "0fFFFFFFFFFFFFFFFFFFf0",
  "0fFffffffffffffffffFf0",
  "0fFffffffffffffffffFf0",
  "0fFFFFFFFFFFFFFFFFFFf0",
  "0ffffffffffffffffffff0",
  "0FF00000000000000000FF0",
];

export const ARMCHAIR: Sprite = [
  "0000000000",
  "0ffffffff0",
  "0fFFFFFFf0",
  "0fFffffFf0",
  "0fFFFFFFf0",
  "0ffffffff0",
  "0F000000F0",
];

export const LOW_TABLE: Sprite = [
  "000000000000000",
  "066666666666660",
  "065555555555560",
  "064444444444460",
  "066666666666660",
  "0.0.........0.0",
];

export const PAINTING: Sprite = [
  "0000000000000000",
  "0666666666666660",
  "06LLLLLLLLLLLL60",
  "06LLLLLNNLLLLL60",
  "06LLLNNNNNLLLL60",
  "06LNNNNNNNNNLL60",
  "06NNNNNNNNNNNN60",
  "0666666666666660",
  "0000000000000000",
];

export const BOOKSHELF: Sprite = [
  "000000000000000000",
  "066666666666666660",
  "064444444444444460",
  "064R4G4Y4L4p4R4G460",
  "064R4G4Y4L4p4R4G460",
  "064444444444444460",
  "066666666666666660",
  "064p4L4Y4G4R4p4L460",
  "064p4L4Y4G4R4p4L460",
  "064444444444444460",
  "066666666666666660",
  "000000000000000000",
];

export const WALL_CLOCK: Sprite = [
  "..0000..",
  ".066660.",
  "06a00a60",
  "06a00a60",
  "06aa0aa0",
  ".066660.",
  "..0000..",
];

export const BOXES: Sprite = [
  "..........",
  "..0000000.",
  "..0666660.",
  "..0644460.",
  "..0666660.",
  "000000000.",
  "066666060.",
  "064446060.",
  "066666060.",
  "000000000.",
];

/** A taller, spikier plant, so the greenery is not all one shape. */
export const CACTUS_POT: Sprite = [
  "..N.....",
  "..N.N...",
  "..NNN...",
  ".NNNN...",
  "..NNN.N.",
  "..NNNNN.",
  "..NNNN..",
  "...NN...",
  "..oooo..",
  "..oooo..",
  "...oo...",
];
