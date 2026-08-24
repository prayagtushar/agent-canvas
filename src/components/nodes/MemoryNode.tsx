import { memo, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { api } from "../../api";
import { useStore } from "../../store";
import type { MemoryFlowNode } from "../../types";

/** Shared canvas memory: every connected agent reads and writes these facts
 *  through the Bus, instead of each keeping its own. */
function MemoryNodeInner(_: NodeProps<MemoryFlowNode>) {
  const memory = useStore((s) => s.memory);
  const search = useStore((s) => s.search);
  const refreshMemory = useStore((s) => s.refreshMemory);
  const labelOf = useStore((s) => s.labelOf);
  const pushToast = useStore((s) => s.pushToast);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const hit =
    search !== "" &&
    memory.some(
      (m) =>
        m.key.toLowerCase().includes(search.toLowerCase()) ||
        m.value.toLowerCase().includes(search.toLowerCase())
    );

  const write = async () => {
    if (!key.trim() || !value.trim()) return;
    try {
      await api.remember(key.trim(), value.trim());
      setKey("");
      setValue("");
      await refreshMemory();
    } catch (e) {
      pushToast("err", String(e));
    }
  };

  const forget = async (k: string) => {
    try {
      await api.forgetMemory(k);
      await refreshMemory();
    } catch (e) {
      pushToast("err", String(e));
    }
  };

  return (
    <div className={`project-card memory-card ${hit ? "hit" : ""}`}>
      <div className="pc-head">
        <span className="mem-glyph" />
        Shared memory
        <span className="pc-count">{memory.length}</span>
      </div>

      <div className="pc-body nowheel">
        {memory.length === 0 && (
          <div className="muted small">
            Nothing remembered yet. Agents write here with <code>remember</code>.
          </div>
        )}
        {memory.map((m) => (
          <div key={m.key} className="mem-item">
            <div className="mem-key-row">
              <span className="mem-key">{m.key}</span>
              <button className="mem-forget" title="Forget this" onClick={() => void forget(m.key)}>
                ×
              </button>
            </div>
            <div className="mem-value">{m.value}</div>
            <div className="mem-author">{labelOf(m.author)}</div>
          </div>
        ))}
      </div>

      <div className="mem-write">
        <input
          className="mem-input nodrag"
          placeholder="key"
          value={key}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => setKey(e.target.value)}
        />
        <input
          className="mem-input nodrag grow"
          placeholder="what to remember"
          value={value}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void write();
          }}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    </div>
  );
}

const MemoryNode = memo(MemoryNodeInner);
export default MemoryNode;
