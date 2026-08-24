import { memo, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { api } from "../../api";
import { useStore } from "../../store";
import type { TaskBoardFlowNode, Task } from "../../types";

const STATUS_CLASS: Record<Task["status"], string> = {
  todo: "st-todo",
  claimed: "st-claimed",
  done: "st-done",
};

/** The shared board. Agents claim from it, and so the operator can seed it:
 *  a plan you already have in your head is faster to type than to explain to
 *  a planning agent. A claim is exclusive, so whatever is written here is
 *  picked up exactly once. */
function TaskBoardNodeInner(_: NodeProps<TaskBoardFlowNode>) {
  const tasks = useStore((s) => s.tasks);
  const labelOf = useStore((s) => s.labelOf);
  const pushToast = useStore((s) => s.pushToast);
  const [title, setTitle] = useState("");

  const done = tasks.filter((t) => t.status === "done").length;

  const add = () => {
    const text = title.trim();
    if (!text) return;
    setTitle("");
    void api.addTask(text, "").catch((e) => pushToast("err", String(e)));
  };

  const remove = (t: Task) => {
    void api.removeTask(t.id).catch((e) => pushToast("err", String(e)));
  };

  return (
    <div className="project-card">
      <div className="pc-head">
        <span className="pc-dot" />
        Project card
        <span className="pc-count">
          {tasks.length === 0 ? "0" : `${done}/${tasks.length}`}
        </span>
      </div>
      <div className="pc-body nowheel">
        {tasks.length === 0 && (
          <div className="muted small">
            Nothing on the board. Write a task below, or let an agent add one
            with <code>add_task</code>.
          </div>
        )}
        {tasks.map((t) => (
          <div key={t.id} className={`task-item ${t.status === "done" ? "is-done" : ""}`}>
            <div className="task-title-row">
              <span>{t.title}</span>
              {/* Keyed on the status so the chip remounts and replays its
                  animation when an agent claims or completes the task. A
                  class swap alone changes the colour with no movement. */}
              <span key={t.status} className={`task-status ${STATUS_CLASS[t.status]}`}>
                {t.status}
              </span>
              {t.status !== "claimed" && (
                <button
                  className="task-drop"
                  title="Take this off the board"
                  aria-label="Take this off the board"
                  onClick={() => remove(t)}
                >
                  ×
                </button>
              )}
            </div>
            {t.details && <div className="task-owner">{t.details}</div>}
            {t.owner && <div className="task-owner">owner: {labelOf(t.owner)}</div>}
            {t.result && <div className="task-result">{t.result}</div>}
          </div>
        ))}
      </div>

      <div className="mem-write">
        <input
          className="mem-input nodrag grow"
          placeholder="Add a task for whoever claims it"
          value={title}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") add();
          }}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
    </div>
  );
}

const TaskBoardNode = memo(TaskBoardNodeInner);
export default TaskBoardNode;
