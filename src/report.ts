import type { Activity, CanvasNode, MemoryEntry, Task } from "./types";

export interface ReportInput {
  workspaceRoot: string;
  startedAt: number;
  endedAt: number;
  nodes: CanvasNode[];
  edges: { source: string; target: string }[];
  statuses: Record<string, string>;
  activity: Activity[];
  tasks: Task[];
  memory: MemoryEntry[];
  /** Node id to everything its terminal holds. */
  transcripts: Record<string, string>;
}

function stamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function span(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours}h ${rest.toString().padStart(2, "0")}m`;
}

/** A fence long enough to survive whatever the terminal printed inside it. */
function fence(body: string): string {
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return ticks;
}

/** What the session did, as Markdown.
 *
 *  Pure on purpose: a report worth handing to somebody else is worth being
 *  able to test, and everything it needs is already in the store. */
export function buildReport(input: ReportInput): string {
  const agents = input.nodes.filter(
    (n): n is Extract<CanvasNode, { type: "agent" }> =>
      n.type === "agent" && !n.data.pending
  );
  const name = (id: string) =>
    agents.find((a) => a.id === id)?.data.label ?? id;

  const folder =
    input.workspaceRoot.split("/").filter(Boolean).pop() ?? input.workspaceRoot;
  const done = input.tasks.filter((t) => t.status === "done").length;

  const out: string[] = [];

  out.push(`# Agent Canvas session — ${folder}`);
  out.push("");
  out.push(
    `${agents.length} agent${agents.length === 1 ? "" : "s"}, ` +
      `${input.edges.length} connection${input.edges.length === 1 ? "" : "s"}, ` +
      `${input.activity.length} message${input.activity.length === 1 ? "" : "s"} between them, ` +
      `${done} of ${input.tasks.length} task${input.tasks.length === 1 ? "" : "s"} finished.`
  );
  out.push("");
  out.push(`- **Folder** \`${input.workspaceRoot}\``);
  out.push(`- **Started** ${stamp(input.startedAt)}`);
  out.push(`- **Ended** ${stamp(input.endedAt)} (${span(input.endedAt - input.startedAt)})`);
  out.push("");

  out.push("## The team");
  out.push("");
  if (agents.length === 0) {
    out.push("No agents ran in this session.");
  } else {
    out.push("| Agent | CLI | Role | Working in | Ended |");
    out.push("| --- | --- | --- | --- | --- |");
    for (const a of agents) {
      const status = input.statuses[a.data.nodeId] ?? a.data.status;
      const where = a.data.worktree ?? a.data.cwd;
      out.push(
        `| ${a.data.label} | ${a.data.harness} | ${a.data.role || "—"} | \`${where}\` | ${status} |`
      );
    }
  }
  out.push("");

  out.push("## Connections");
  out.push("");
  if (input.edges.length === 0) {
    out.push("None. Every agent worked alone: without a connection they cannot see each other.");
  } else {
    for (const e of input.edges) {
      out.push(`- ${name(e.source)} ↔ ${name(e.target)}`);
    }
  }
  out.push("");

  out.push("## What they said to each other");
  out.push("");
  if (input.activity.length === 0) {
    out.push("Nothing crossed a wire.");
  } else {
    for (const m of input.activity) {
      out.push(
        `**${name(m.from)} → ${name(m.to)}** · ${new Date(m.ts).toLocaleTimeString()}`
      );
      out.push("");
      out.push(`> ${m.text.split("\n").join("\n> ")}`);
      out.push("");
    }
  }

  out.push("## Tasks");
  out.push("");
  if (input.tasks.length === 0) {
    out.push("The shared board was never used.");
  } else {
    for (const t of input.tasks) {
      const owner = t.owner ? ` — ${name(t.owner)}` : "";
      out.push(`- **${t.title}** (${t.status}${owner})`);
      if (t.details) out.push(`  - ${t.details}`);
      if (t.result) out.push(`  - Result: ${t.result}`);
    }
  }
  out.push("");

  out.push("## Shared memory");
  out.push("");
  if (input.memory.length === 0) {
    out.push("Nothing was written to shared memory.");
  } else {
    for (const m of input.memory) {
      out.push(`- \`${m.key}\` — ${m.value} *(${name(m.author)})*`);
    }
  }
  out.push("");

  out.push("## Transcripts");
  out.push("");
  for (const a of agents) {
    const text = (input.transcripts[a.data.nodeId] ?? "").trimEnd();
    out.push(`### ${a.data.label} (${a.data.harness})`);
    out.push("");
    if (!text) {
      out.push("Nothing on screen.");
    } else {
      const f = fence(text);
      out.push(f);
      out.push(text);
      out.push(f);
    }
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push("Written by [Agent Canvas](https://github.com/prayagtushar/agent-canvas).");
  out.push("");

  return out.join("\n");
}

/** A filename that sorts by date and says which folder it came from. */
export function reportFilename(workspaceRoot: string, at: number): string {
  const folder =
    workspaceRoot.split("/").filter(Boolean).pop()?.replace(/[^\w.-]+/g, "-") ?? "canvas";
  const d = new Date(at);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${folder}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.md`;
}
