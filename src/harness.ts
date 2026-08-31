/** What a harness and a status look like, in one place.
 *
 *  The canvas and the office draw the same agents in different shapes, and an
 *  agent that is orange in one and green in the other is worse than either
 *  choice on its own. */

export const HARNESS_LABEL: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "opencode",
};

export const TAG_CLASS: Record<string, string> = {
  claude: "tag-claude",
  codex: "tag-codex",
  gemini: "tag-gemini",
  opencode: "tag-opencode",
};

export const STATUS_COLOR: Record<string, string> = {
  idle: "#949cab",
  running: "#2fd45e",
  waiting: "#febc2e",
  exited: "#ff5f57",
  error: "#ff5f57",
};

/** The expanding ring around the status dot, drawn in the dot's own colour so
 *  a waiting agent pulses amber and a working one green. */
export const STATUS_RING: Record<string, string> = {
  running: "rgba(47, 212, 94, 0.55)",
  waiting: "rgba(254, 188, 46, 0.55)",
};

/** The colour an agent is drawn in, from its harness. Falls back to the wire
 *  blue for a CLI nobody has given a colour yet. */
export function harnessColor(harness: string): string {
  const known: Record<string, string> = {
    claude: "var(--h-claude)",
    codex: "var(--h-codex)",
    gemini: "var(--h-gemini)",
    opencode: "var(--h-opencode)",
  };
  return known[harness] ?? "var(--wire)";
}

/** Up to two letters for an agent token, from the name the operator gave it.
 *  Two words give their initials; one word gives its first two letters. */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
