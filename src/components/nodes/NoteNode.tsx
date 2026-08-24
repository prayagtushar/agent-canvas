import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { matchesSearch, updateNodeData, useStore } from "../../store";
import type { NoteFlowNode } from "../../types";

function NoteNodeInner({ id, data }: NodeProps<NoteFlowNode>) {
  const search = useStore((s) => s.search);
  const removeNode = useStore((s) => s.removeNode);

  const hit = matchesSearch({ type: "note", data } as never, search);

  // Deterministic per-note tilt so the board looks handled, not generated.
  const tilt = ((id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 5) - 2) * 0.9;

  return (
    <div className={`sticky-note ${hit ? "hit" : ""}`} style={{ ["--tilt" as string]: `${tilt}deg` }}>
      <div className="sticky-lights">
        <span
          className="tl-dot tl-red"
          title="Remove this note"
          style={{ cursor: "pointer" }}
          onClick={() => removeNode(id)}
        />
        <span className="tl-dot tl-yellow" />
        <span className="tl-dot tl-green" />
        <span className="sticky-title">note</span>
      </div>
      <textarea
        className="note-textarea nodrag nowheel"
        value={data.note}
        placeholder="Write a note"
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => updateNodeData(id, { note: e.target.value })}
      />
    </div>
  );
}

const NoteNode = memo(NoteNodeInner);
export default NoteNode;
