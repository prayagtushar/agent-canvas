import { useState } from "react";
import { useStore } from "./store";
import { api } from "./api";

export default function Approvals() {
  const approvals = useStore((s) => s.approvals);
  const nodes = useStore((s) => s.nodes);
  const removeApproval = useStore((s) => s.removeApproval);
  const pushToast = useStore((s) => s.pushToast);
  const [replies, setReplies] = useState<Record<string, string>>({});

  const pending = approvals.filter((a) => a.answer === null);
  if (pending.length === 0) return null;

  const answer = (id: string, ans: string) => {
    removeApproval(id);
    setReplies((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
    api.answerApproval(id, ans).catch((e) => pushToast("err", String(e)));
  };

  return (
    <div className="approvals">
      {pending.map((a) => {
        const node = nodes.find((n) => n.id === a.fromNode);
        const fromLabel = node && node.type === "agent" ? node.data.label : a.fromNode;
        const reply = replies[a.id] ?? "";
        return (
          <div key={a.id} className="approval-card">
            <div className="appr-from">
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: "#febc2e" }}
              />
              {fromLabel} needs your decision
            </div>
            <div className="appr-q">{a.question}</div>
            <input
              className="appr-reply"
              placeholder="Answer in your own words (optional)"
              value={reply}
              onChange={(e) => setReplies((r) => ({ ...r, [a.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && reply.trim()) answer(a.id, reply.trim());
              }}
            />
            <div className="appr-actions">
              <button
                className="appr-btn appr-yes"
                onClick={() => answer(a.id, reply.trim() || "approve")}
              >
                {reply.trim() ? "Send" : "Approve"}
              </button>
              <button className="appr-btn appr-no" onClick={() => answer(a.id, "deny")}>
                Deny
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
