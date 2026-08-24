import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  api: {
    agentInput: vi.fn().mockResolvedValue(undefined),
    agentResize: vi.fn().mockResolvedValue(undefined),
  },
}));

import { api } from "./api";
import * as terminals from "./terminals";

/** xterm measures a glyph before it will render, and jsdom lays nothing out.
 *  Everything here is about the registry around the emulator, so the box just
 *  has to be a box. */
function box(): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 600, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 320, configurable: true });
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.replaceChildren();
  // `restoreMocks` wipes what the factory set up, and the registry calls
  // `.catch` on whatever these return the moment a key is pressed.
  vi.mocked(api.agentInput).mockResolvedValue(undefined);
  vi.mocked(api.agentResize).mockResolvedValue(undefined);
});

describe("output that arrives before a node is on screen", () => {
  it("is kept and replayed once there is a terminal for it", () => {
    terminals.write("early", "hello from before the node existed\r\n");
    const { term } = terminals.attach("early", box());
    // xterm parses writes on its own schedule; flush it.
    return new Promise<void>((done) => {
      term.write("", () => {
        expect(terminals.textOf("early")).toContain("before the node existed");
        terminals.dispose("early");
        done();
      });
    });
  });

  it("drops the oldest of it rather than growing without a bound", () => {
    terminals.write("loud", "OLDEST-LINE\r\n");
    for (let i = 0; i < 6; i++) terminals.write("loud", `${"filler ".repeat(8000)}\r\n`);
    terminals.write("loud", "NEWEST-LINE\r\n");

    const { term } = terminals.attach("loud", box());
    return new Promise<void>((done) => {
      term.write("", () => {
        const text = terminals.textOf("loud");
        expect(text).toContain("NEWEST-LINE");
        expect(text).not.toContain("OLDEST-LINE");
        terminals.dispose("loud");
        done();
      });
    });
  }, 20_000);
});

describe("the terminal outlives the component", () => {
  it("keeps its scrollback when the node remounts somewhere else", () => {
    const first = box();
    const { term } = terminals.attach("keeps", first);
    term.write("a line worth keeping\r\n");
    return new Promise<void>((done) => {
      term.write("", () => {
        const second = box();
        const again = terminals.attach("keeps", second);
        expect(again.term).toBe(term);
        expect(again.host.parentElement).toBe(second);
        expect(terminals.textOf("keeps")).toContain("worth keeping");
        terminals.dispose("keeps");
        done();
      });
    });
  });

  it("takes the element away with it when the node is deleted", () => {
    const el = box();
    terminals.attach("gone", el);
    expect(el.querySelector(".term-host")).not.toBeNull();
    terminals.dispose("gone");
    expect(el.querySelector(".term-host")).toBeNull();
    expect(terminals.textOf("gone")).toBe("");
  });
});

describe("what the operator types", () => {
  it("goes to that agent's pty and no other", () => {
    const { term } = terminals.attach("typing", box());
    term.input("ls\r");
    expect(api.agentInput).toHaveBeenCalledWith("typing", "ls\r");
    terminals.dispose("typing");
  });
});
