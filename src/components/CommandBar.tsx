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

export default function CommandBar() {
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [sugIdx, setSugIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodes = useStore((s) => s.nodes);
  const harnesses = useStore((s) => s.harnesses);
  const launchAgent = useStore((s) => s.launchAgent);
  const addNote = useStore((s) => s.addNote);
  const addTaskBoard = useStore((s) => s.addTaskBoard);
  const clearOutputs = useStore((s) => s.clearOutputs);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const statuses = useStore((s) => s.statuses);
  const pushToast = useStore((s) => s.pushToast);

  useEffect(() => {
    const t = setInterval(() => setSugIdx((i) => (i + 1) % SUGGESTIONS.length), 4600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const agents = nodes.filter((n): n is AgentFlowNode => n.type === "agent");

  const say = (m: string) => {
    setText("");
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
        ? [named[0].data.nodeId, named[1].data.nodeId]
        : [agents[agents.length - 2].data.nodeId, agents[agents.length - 1].data.nodeId];
    try {
      await api.addEdge(a, b);
      say(`Connected ${a} and ${b}.`);
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
      clearOutputs();
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

    // Anything else goes to the selected agent as a prompt.
    if (selectedNodeId && agents.some((n) => n.data.nodeId === selectedNodeId)) {
      void api.sendPrompt(selectedNodeId, raw).catch((e) => pushToast("err", String(e)));
      const label = agents.find((n) => n.data.nodeId === selectedNodeId)?.data.label;
      say(`Sent to ${label}.`);
      return;
    }

    pushToast("err", "Select an agent to prompt it, or start with “add … agent”.");
  };

  return (
    <>
      {flash && <div className="cmd-flash">{flash}</div>}
      <div className="commandbar-panel">
        <div
          className="commandbar"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void submit();
          }}
        >
          <span className="cmd-dot" title="The Bus is running" />
          <span className="cmd-clip" title="Attachments are not supported yet">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l8.49-8.48a4 4 0 1 1 5.66 5.65L9.17 17.2a2 2 0 1 1-2.83-2.83l7.78-7.78" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder={SUGGESTIONS[sugIdx]}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="cmd-send"
            title="Run"
            disabled={!text.trim()}
            onClick={() => void submit()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
          <button className="cmd-collapse" title="Dismiss" onClick={() => inputRef.current?.blur()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
