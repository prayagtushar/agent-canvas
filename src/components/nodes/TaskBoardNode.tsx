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

  return (
    <div className="project-card">
      <div className="pc-head">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#30d158",
          }}
        />
        Project card
        <span className="pc-count">{tasks.length}</span>
      </div>
      <div className="pc-body">
        {tasks.length === 0 && <div className="muted small">no tasks yet</div>}
        {tasks.map((t) => (
          <div key={t.id} className="task-item">
            <div className="task-title-row">
              <span>{t.title}</span>
              <span className={`task-status ${STATUS_CLASS[t.status]}`}>{t.status}</span>
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
