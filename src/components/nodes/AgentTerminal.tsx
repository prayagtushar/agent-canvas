import { useEffect, useRef } from "react";
import * as terminals from "../../terminals";

/** The agent's own interface, drawn by a terminal emulator over a real pty.
 *
 *  The component owns nothing but the box: the emulator lives in the registry
 *  and is only borrowed here, so scrollback survives a remount and output that
 *  arrives before the node is on screen is not lost. */
export default function AgentTerminal({ nodeId }: { nodeId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    terminals.attach(nodeId, box);
    terminals.measure(nodeId);
    // A ResizeObserver reports the node's layout size, which the canvas zoom
    // does not touch — so this fires when the operator resizes the node, and
    // stays quiet while they pan and zoom around it.
    const observer = new ResizeObserver(() => terminals.measure(nodeId));
    observer.observe(box);
    return () => observer.disconnect();
  }, [nodeId]);

  return (
    <div
      ref={ref}
      className="term-wrap nodrag nowheel"
      onMouseUp={() => terminals.focus(nodeId)}
    />
  );
}
