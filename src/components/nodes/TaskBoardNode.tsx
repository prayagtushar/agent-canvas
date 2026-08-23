import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { useStore } from "../../store";
import type { TaskBoardFlowNode, Task } from "../../types";

const STATUS_CLASS: Record<Task["status"], string> = {
  todo: "st-todo",
  claimed: "st-claimed",
  done: "st-done",
};

function TaskBoardNodeInner(_: NodeProps<TaskBoardFlowNode>) {
  const tasks = useStore((s) => s.tasks);
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="project-card">
      <div className="pc-head">
        <span className="pc-dot" />
        Project card
        <span className="pc-count">
          {tasks.length === 0 ? "0" : `${done}/${tasks.length}`}
        </span>
      </div>
      <div className="pc-body">
        {tasks.length === 0 && <div className="muted small">no tasks yet</div>}
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
            </div>
            {t.owner && <div className="task-owner">owner: {t.owner}</div>}
            {t.result && <div className="task-result">{t.result}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

const TaskBoardNode = memo(TaskBoardNodeInner);
export default TaskBoardNode;
