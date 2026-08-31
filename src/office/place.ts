import { BOARD, DOOR, MANAGER, SHELF, standingAt, type Point } from "./layout";

/** Somewhere an agent can be sent, and why.
 *
 *  Every one of these is a real event on the Bus rather than idle wandering.
 *  The office sims this borrows from tail a transcript file and guess at what
 *  the agent is up to; one of them says outright that it cannot tell when an
 *  agent is waiting for input and falls back to idle timers that misfire. The
 *  canvas does not have to guess: it owns the pty and it owns the Bus, so a
 *  trip across this room always means something actually happened. */
export type Errand =
  /** Carrying a message to a peer it is wired to. */
  | { kind: "peer"; peer: string; text: string }
  /** Taking work off the board, or putting a result back. */
  | { kind: "board"; text: string }
  /** Writing something down where every peer can read it. */
  | { kind: "shelf"; text: string }
  /** Just hired by another agent, and not at a desk yet. */
  | { kind: "arrive" };

export type Placement = {
  point: Point;
  /** True when the agent is away from its desk, so the view can stand the
   *  token up rather than seat it. */
  away: boolean;
  /** What to show above its head, if anything. */
  says: string | null;
};

export type PlaceInput = {
  desk: Point;
  /** Blocked on you: the agent called `ask_user` and is waiting for an answer. */
  blocked: boolean;
  /** A trip in flight, if any. */
  errand: Errand | null;
  /** Where a peer sits, for a peer errand. Missing peers are ignored rather
   *  than sending the agent to the corner of the room. */
  deskOf: (nodeId: string) => Point | undefined;
};

/** Where an agent should be standing right now.
 *
 *  Being blocked on you outranks any errand. An agent that has stopped and is
 *  waiting on a person is the single most useful thing this view can show, and
 *  it should not be hidden because a message happened to go out first. */
export function place(input: PlaceInput): Placement {
  const { desk, blocked, errand, deskOf } = input;

  if (blocked) {
    // Further back than a normal visit: your desk is wider than an agent's,
    // and a token parked on top of it reads as furniture rather than as
    // somebody waiting.
    return {
      point: standingAt(MANAGER, desk, 92),
      away: true,
      says: "needs you",
    };
  }

  if (errand?.kind === "peer") {
    const peerDesk = deskOf(errand.peer);
    if (peerDesk) {
      return { point: standingAt(peerDesk, desk), away: true, says: errand.text };
    }
    // A peer that is not on the canvas: stay put rather than walk nowhere.
    return { point: desk, away: false, says: errand.text };
  }

  if (errand?.kind === "arrive") {
    // Stand in the doorway. Clearing this errand sends the token to its desk,
    // and the walk is the same transition every other trip uses.
    return { point: DOOR, away: true, says: "just hired" };
  }

  if (errand?.kind === "shelf") {
    return { point: standingAt(SHELF, desk), away: true, says: errand.text };
  }

  if (errand?.kind === "board") {
    return { point: standingAt(BOARD, desk), away: true, says: errand.text };
  }

  return { point: desk, away: false, says: null };
}
