import type { Theme } from "./types";

/** The sixteen ANSI colours, in the order a terminal expects them:
 *  black, red, green, yellow, blue, magenta, cyan, white, then the eight
 *  bright variants.
 *
 *  These live here rather than in styles.css because nothing but the terminal
 *  emulator reads them — a CSS custom property would be a variable no
 *  stylesheet ever uses. The surface colours a theme shares with the rest of
 *  the app (`--term-bg`, `--txt`, `--wire`) stay in CSS and are read back at
 *  runtime, so a palette can never drift from the window it sits in.
 *
 *  Values are each project's published terminal palette. The two the canvas
 *  owns, Midnight and Ink, are built from its own accents. */
export const ANSI: Record<Theme, string[]> = {
  midnight: [
    "#1b1f27", "#ff5f57", "#2fd45e", "#febc2e",
    "#3d8bfd", "#d8b4fe", "#5ad4e6", "#c8cdd6",
    "#5b6472", "#ff8a84", "#6ee68f", "#ffd166",
    "#79b0ff", "#e9cbff", "#8ee6f2", "#f2f4f8",
  ],
  "tokyo-night": [
    "#15161e", "#f7768e", "#9ece6a", "#e0af68",
    "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
    "#414868", "#f7768e", "#9ece6a", "#e0af68",
    "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
  ],
  dracula: [
    "#21222c", "#ff5555", "#50fa7b", "#f1fa8c",
    "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
    "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5",
    "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
  ],
  nord: [
    "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b",
    "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
    "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b",
    "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
  ],
  catppuccin: [
    "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af",
    "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
    "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af",
    "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8",
  ],
  gruvbox: [
    "#282828", "#cc241d", "#98971a", "#d79921",
    "#458588", "#b16286", "#689d6a", "#a89984",
    "#928374", "#fb4934", "#b8bb26", "#fabd2f",
    "#83a598", "#d3869b", "#8ec07c", "#ebdbb2",
  ],
  "one-dark": [
    "#282c34", "#e06c75", "#98c379", "#e5c07b",
    "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
    "#5c6370", "#ff616e", "#a5e075", "#f0a45d",
    "#4dc4ff", "#de73ff", "#4cd1e0", "#e6e6e6",
  ],
  "rose-pine": [
    "#26233a", "#eb6f92", "#31748f", "#f6c177",
    "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
    "#6e6a86", "#eb6f92", "#31748f", "#f6c177",
    "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
  ],
  solarized: [
    "#073642", "#dc322f", "#859900", "#b58900",
    "#268bd2", "#d33682", "#2aa198", "#eee8d5",
    "#002b36", "#cb4b16", "#586e75", "#657b83",
    "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
  ],
  ink: [
    "#16161a", "#e05561", "#8cc265", "#d18f52",
    "#6e8cff", "#a48fe0", "#6ec2c8", "#b6b9c2",
    "#4a4d57", "#ff6b78", "#a5d97c", "#e8ad6b",
    "#8aa4ff", "#bda8f0", "#89d6dc", "#e8eaf0",
  ],
};
