import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { AgentFlowNode } from "../types";

const SUGGESTIONS = [
  "Try “add a Claude Code agent and a Codex agent, then connect them”",
  "Try “add a gemini agent named Juno”",
  "Try “connect them”",
  "Try “note: check the migration before merging”",
  "Try “stop”",
];

const HARNESS_WORDS: [RegExp, string][] = [
  [/claude/i, "claude"],
  [/codex/i, "codex"],
  [/gemini/i, "gemini"],
  [/open\s?code/i, "opencode"],
];

const HARNESS_DOT: Record<string, string> = {
  claude: "var(--h-claude)",
  codex: "var(--h-codex)",
  gemini: "var(--h-gemini)",
  opencode: "var(--h-opencode)",
};

export default function CommandBar() {
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [sugIdx, setSugIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** How far back through history ↑ has walked. -1 is the live draft. */
  const [recall, setRecall] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  const nodes = useStore((s) => s.nodes);
  const harnesses = useStore((s) => s.harnesses);
  const launchAgent = useStore((s) => s.launchAgent);
  const addNote = useStore((s) => s.addNote);
  const addTaskBoard = useStore((s) => s.addTaskBoard);
  const clearTerminals = useStore((s) => s.clearTerminals);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const setSelected = useStore((s) => s.setSelected);
  const revealNode = useStore((s) => s.revealNode);
  const statuses = useStore((s) => s.statuses);
  const pushToast = useStore((s) => s.pushToast);
  const promptAll = useStore((s) => s.promptAll);
  const broadcast = useStore((s) => s.broadcast);
  const setBroadcast = useStore((s) => s.setBroadcast);
  const history = useStore((s) => s.history);
  const pushHistory = useStore((s) => s.pushHistory);

  const agents = nodes.filter(
    (n): n is AgentFlowNode => n.type === "agent" && !n.data.pending
  );
  // With one agent on the canvas there is nothing to disambiguate, so the bar
  // talks to it whether or not the operator has clicked its window.
  const target = broadcast
    ? null
    : agents.find((a) => a.data.nodeId === selectedNodeId) ??
      (agents.length === 1 ? agents[0] : null);

  useEffect(() => {
    const t = setInterval(() => setSugIdx((i) => (i + 1) % SUGGESTIONS.length), 4600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!targetRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pickerOpen]);

  const say = (m: string) => {
    setText("");
    setRecall(-1);
    setFlash(m);
  };

  /* Connect by name when the sentence names two agents, otherwise wire up
     the two most recently launched. The Bus validates and re-emits. */
  const connect = async (raw: string) => {
    if (agents.length < 2) {
      pushToast("err", "Launch two agents before connecting them.");
      return;
    }
    const named = agents.filter((a) =>
      new RegExp(`\\b${a.data.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)
    );
    const [a, b] =
      named.length >= 2
        ? [named[0], named[1]]
        : [agents[agents.length - 2], agents[agents.length - 1]];
    try {
      await api.addEdge(a.data.nodeId, b.data.nodeId);
      say(`Connected ${a.data.label} and ${b.data.label}.`);
    } catch (e) {
      pushToast("err", String(e));
    }
  };

  const addAgent = async (raw: string, lower: string) => {
    // "add a claude agent and a codex agent" launches both, in order.
    const wanted = HARNESS_WORDS.filter(([re]) => re.test(lower)).map(([, n]) => n);
    const targets = wanted.length
      ? wanted
      : [harnesses.find((h) => h.available)?.name].filter(Boolean as unknown as (v: string | undefined) => v is string);

    if (targets.length === 0) {
      pushToast("err", "No agent CLIs found on your PATH.");
      return;
    }
    const missing = targets.filter((t) => !harnesses.find((h) => h.name === t)?.available);
    if (missing.length) {
      pushToast("err", `${missing.join(" and ")} is not installed.`);
      return;
    }

    const named = raw.match(/(?:named|called)\s+([A-Za-z0-9_-]+)/i)?.[1];
    const prompt = raw.match(/\b(?:and (?:ask|tell) it to|prompt[:\s]+)(.+)$/i)?.[1] ?? "";

    say(targets.length > 1 ? `Launching ${targets.join(" and ")}…` : `Launching ${targets[0]}…`);
    for (const t of targets) {
      await launchAgent(t, targets.length === 1 ? named : undefined, prompt);
    }
    if (/\b(then )?connect\b/i.test(lower)) await connect(raw);
  };

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    pushHistory(raw);

    // "all: <prompt>" still works, and so does the Everyone target.
    const prefixed = raw.match(/^(?:all|everyone|broadcast)\s*[:,]?\s+(.+)$/i)?.[1];
    if (prefixed || (broadcast && !isCanvasCommand(lower))) {
      const n = promptAll(prefixed ?? raw);
      say(n ? `Sent to ${n} agent${n === 1 ? "" : "s"}.` : "No agents to send to.");
      return;
    }

    if (/^note\b/i.test(lower)) {
      addNote(raw.replace(/^note\b[:\s]*/i, ""));
      say("Added a sticky note.");
      return;
    }

    if (/\b(add|launch|start|spawn|create)\b/.test(lower) && /\bagents?\b/.test(lower)) {
      await addAgent(raw, lower);
      return;
    }

    if (/\b(project card|task ?board)\b/.test(lower)) {
      addTaskBoard();
      say("Added the project card.");
      return;
    }

    if (/\b(connect|link)\b/.test(lower)) {
      await connect(raw);
      return;
    }

    if (/^(clear|wipe)\b/i.test(lower)) {
      clearTerminals();
      say("Cleared all output.");
      return;
    }

    if (/^(stop|interrupt|kill|halt)\b/i.test(lower)) {
      const targets =
        selectedNodeId && statuses[selectedNodeId] === "running"
          ? [selectedNodeId]
          : Object.entries(statuses)
              .filter(([, st]) => st === "running")
              .map(([id]) => id);
      targets.forEach((id) => void api.interruptAgent(id));
      say(targets.length ? `Interrupted ${targets.length}.` : "Nothing is running.");
      return;
    }

    // Anything else goes to the agent named in the target chip.
    if (target) {
      void api.sendPrompt(target.data.nodeId, raw).catch((e) => pushToast("err", String(e)));
      say(`Sent to ${target.data.label}.`);
      return;
    }

    pushToast(
      "err",
      agents.length
        ? "Pick an agent in the bar below, or click its window first."
        : "Launch an agent before prompting one."
    );
  };

  /** Walk the history of sent prompts. Leaves an unsent draft alone. */
  const step = (delta: number) => {
    if (history.length === 0) return;
    const next = Math.min(history.length - 1, Math.max(-1, recall + delta));
    setRecall(next);
    setText(next === -1 ? "" : history[next]);
    // Put the caret at the end of what was just recalled, not where it was.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) el.selectionStart = el.selectionEnd = el.value.length;
    });
  };

  const targetLabel = broadcast ? "Everyone" : target ? target.data.label : "Pick an agent";
  const placeholder = broadcast
    ? `Message all ${agents.length} agent${agents.length === 1 ? "" : "s"}`
    : target
      ? `Message ${target.data.label}`
      : SUGGESTIONS[sugIdx];

  return (
    <>
      {flash && <div className="cmd-flash">{flash}</div>}
      <div className="commandbar-panel">
        <div
          className="commandbar"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void submit();
            else if (e.key === "ArrowUp") {
              e.preventDefault();
              step(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              step(-1);
            }
          }}
        >
          <div className="cmd-target-wrap" ref={targetRef}>
            <button
              className={`cmd-target ${broadcast ? "is-all" : ""} ${target || broadcast ? "" : "is-none"}`}
              title="Choose who this goes to"
              onClick={() => setPickerOpen(!pickerOpen)}
            >
              <span
                className="cmd-target-dot"
                style={{
                  background: broadcast
                    ? "var(--wire)"
                    : target
                      ? HARNESS_DOT[target.data.harness] ?? "var(--dim)"
                      : "var(--dim)",
                }}
              />
              <span className="cmd-target-name">{targetLabel}</span>
              <span className="caret">▾</span>
            </button>
            {pickerOpen && (
              <div className="cmd-picker">
                <div className="menu-head">Send to</div>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className="menu-item"
                    onClick={() => {
                      setBroadcast(false);
                      setSelected(a.id);
                      revealNode(a.id);
                      setPickerOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="cmd-pick-name">
                      <span
                        className="cmd-target-dot"
                        style={{ background: HARNESS_DOT[a.data.harness] ?? "var(--dim)" }}
                      />
                      {a.data.label}
                    </span>
                    {!broadcast && target?.id === a.id && <span className="tick">✓</span>}
                  </button>
                ))}
                {agents.length === 0 && (
                  <div className="menu-item muted">No agents running yet</div>
                )}
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setBroadcast(true);
                    setPickerOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  <span>Everyone</span>
                  {broadcast ? <span className="tick">✓</span> : <span className="muted small">{agents.length}</span>}
                </button>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setRecall(-1);
            }}
          />
          <button
            className="cmd-send"
            title="Send"
            aria-label="Send"
            disabled={!text.trim()}
            onClick={() => void submit()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

/** Sentences the bar acts on itself. In Everyone mode these still drive the
 *  canvas rather than being typed into ten terminals at once. */
function isCanvasCommand(lower: string): boolean {
  return (
    /^note\b/.test(lower) ||
    /^(clear|wipe)\b/.test(lower) ||
    /^(stop|interrupt|kill|halt)\b/.test(lower) ||
    /\b(project card|task ?board)\b/.test(lower) ||
    (/\b(add|launch|start|spawn|create)\b/.test(lower) && /\bagents?\b/.test(lower)) ||
    /\b(connect|link)\b/.test(lower)
  );
}
