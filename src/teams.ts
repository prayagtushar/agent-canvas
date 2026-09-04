import type { Team } from "./types";

/** Teams that ship with the app.
 *
 *  A team is the difference between a canvas of identical CLIs and something
 *  that divides work. Each member gets a role, which its peers read out of
 *  `list_peers`, and an opening brief typed into its terminal.
 *
 *  Every brief ends by telling the agent to wait. Launching a team should not
 *  spend anyone's credits on its own: the operator sends the first instruction,
 *  and the whole team moves at once. */
export const BUILT_IN: Team[] = [
  {
    id: "review-pair",
    label: "Review pair",
    blurb: "One writes, one objects. Nothing ships unread.",
    members: [
      {
        harness: "claude",
        name: "Maker",
        role: "Writes the code",
        brief:
          "You are the Maker on this canvas. You write the code in this folder. " +
          "Your peer the Reviewer reads what you produce and pushes back on it. " +
          "They cannot see your terminal, so nothing reaches them unless you send " +
          "it: when a change is done, call `remember` with a short key describing " +
          "it, then `message_peer` the Reviewer telling them what to look at. " +
          "Do not start work yet. Reply with one line confirming your role, then wait.",
      },
      {
        harness: "codex",
        name: "Reviewer",
        role: "Reviews the Maker's work and objects",
        brief:
          "You are the Reviewer on this canvas. You do not write code. Your peer " +
          "the Maker writes it and will message you when something is ready. When " +
          "they do, call `get_peer_context` to see where they are, read the files " +
          "yourself, and reply with what you would change and why — be specific and " +
          "be willing to say no. Record anything the team must not repeat with " +
          "`remember`. Do not start work yet. Reply with one line confirming your " +
          "role, then wait.",
      },
    ],
    wires: [[0, 1]],
  },
  {
    id: "pipeline",
    label: "Plan, build, verify",
    blurb: "Three agents in a line, each handing on to the next.",
    members: [
      {
        harness: "claude",
        name: "Planner",
        role: "Breaks the work into tasks",
        brief:
          "You are the Planner on this canvas. You do not write code. You break " +
          "what the operator asks for into small, ordered tasks and put each one on " +
          "the shared board with `add_task`, with enough detail that somebody else " +
          "can do it without asking you. Your peer the Builder claims them. " +
          "Do not start work yet. Reply with one line confirming your role, then wait.",
      },
      {
        harness: "codex",
        name: "Builder",
        role: "Claims tasks and implements them",
        brief:
          "You are the Builder on this canvas. Call `list_tasks`, `claim_task` the " +
          "first one that is open, do it, and `complete_task` with what you changed. " +
          "Then take the next. Your peers are the Planner, who writes the tasks, and " +
          "the Verifier, who checks your work — message the Verifier when a task is " +
          "done. Do not start work yet. Reply with one line confirming your role, " +
          "then wait.",
      },
      {
        harness: "gemini",
        name: "Verifier",
        role: "Runs the tests and reports what broke",
        brief:
          "You are the Verifier on this canvas. You do not write features. When the " +
          "Builder tells you a task is finished, run the project's tests and its " +
          "type checker, read the output, and report exactly what failed. If it " +
          "passes, say so plainly. `remember` any failure the team keeps hitting. " +
          "Do not start work yet. Reply with one line confirming your role, then wait.",
      },
    ],
    wires: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    id: "orchestrator",
    label: "Orchestrator",
    blurb: "One lead that hires its own crew and splits the work.",
    members: [
      {
        harness: "claude",
        name: "Lead",
        role: "Orchestrates: plans the work and staffs it",
        brief:
          "You are the Lead on this canvas. You do not write the application " +
          "yourself. When the operator tells you what to build:\n" +
          "1. Break it into parts that can be worked on at the same time, and " +
          "put each on the shared board with `add_task` — enough detail that " +
          "somebody who has not read this can do it.\n" +
          "2. Call `hire_agent` for each worker you need. They start in your " +
          "working directory, connected to you, and see nothing you have read, " +
          "so the `brief` you give each one must say what it owns, which files " +
          "it must not touch, and that it should claim work from the board with " +
          "`list_tasks` and `claim_task`.\n" +
          "3. While they work, use `list_peers` and `get_peer_context` to see " +
          "where they are. Do not do their tasks for them.\n" +
          "4. When the board is clear, read the result yourself, run whatever " +
          "the project uses to build and test, and report back to the operator.\n" +
          "Use `ask_user` for anything only the human can decide. " +
          "Do not start yet. Reply with one line confirming your role, then wait.",
      },
    ],
    wires: [],
  },
  {
    id: "second-opinion",
    label: "Second opinion",
    blurb: "Two different CLIs on one question, arguing it out.",
    members: [
      {
        harness: "claude",
        name: "First",
        role: "Answers the question in its own way",
        brief:
          "You and your peer have been given the same question by the operator and " +
          "you run on different models. Answer it your own way first, without asking " +
          "them. Then call `get_peer_context`, read what they concluded, and say " +
          "plainly where you disagree and which of you you think is right. " +
          "`remember` whatever you settle on. Do not start yet. Reply with one line " +
          "confirming your role, then wait.",
      },
      {
        harness: "codex",
        name: "Second",
        role: "Answers the same question independently",
        brief:
          "You and your peer have been given the same question by the operator and " +
          "you run on different models. Answer it your own way first, without asking " +
          "them. Then call `get_peer_context`, read what they concluded, and say " +
          "plainly where you disagree and which of you you think is right. " +
          "`remember` whatever you settle on. Do not start yet. Reply with one line " +
          "confirming your role, then wait.",
      },
    ],
    wires: [[0, 1]],
  },
];

/** Which CLI each member of a team will actually start on this machine.
 *
 *  A template names the CLI it was written for, and the launcher substitutes
 *  rather than refusing when that one is missing. The menu has to ask the same
 *  question the launcher does, or it offers a team the app will not start:
 *  somebody whose only CLI is opencode was being shown "Second opinion — two
 *  different CLIs" and getting two identical ones.
 *
 *  `installed` is CLI names, in the order the app found them. */
export function resolveHarnesses(team: Team, installed: string[]): string[] {
  if (installed.length === 0) return [];
  return team.members.map((m) =>
    installed.includes(m.harness) ? m.harness : installed[0]
  );
}

/** The same list as a phrase to put under a team's name: "claude, codex", or
 *  "opencode ×2" when one CLI is doing every job. */
export function harnessSummary(names: string[], label: (n: string) => string): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts]
    .map(([n, c]) => (c > 1 ? `${label(n)} \u00d7${c}` : label(n)))
    .join(", ");
}

const SAVED_KEY = "ac.teams";

/** Teams the operator saved off their own canvas. */
export function loadSaved(): Team[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isTeam);
  } catch {
    return [];
  }
}

export function saveTeam(team: Team): Team[] {
  const next = [team, ...loadSaved().filter((t) => t.id !== team.id)];
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* a full store must not lose the canvas that is already running */
  }
  return next;
}

export function deleteTeam(id: string): Team[] {
  const next = loadSaved().filter((t) => t.id !== id);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* nothing to do: the list on screen is what was asked for */
  }
  return next;
}

/** Saved teams come back off disk, so they are checked rather than trusted. */
function isTeam(v: unknown): v is Team {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Partial<Team>;
  return (
    typeof t.id === "string" &&
    typeof t.label === "string" &&
    Array.isArray(t.members) &&
    t.members.length > 0 &&
    t.members.every(
      (m) => typeof m?.harness === "string" && typeof m?.name === "string"
    ) &&
    Array.isArray(t.wires) &&
    t.wires.every(
      (w) => Array.isArray(w) && w.length === 2 && w.every((i) => typeof i === "number")
    )
  );
}
