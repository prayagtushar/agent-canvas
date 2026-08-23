import { memo, useEffect, useRef } from "react";
import {
  BaseEdge,
  Position,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
  type Node,
} from "@xyflow/react";
import { useStore } from "../store";

/** How long a message takes to travel its wire, in ms. Long enough to read as
 *  motion, short enough that a burst of messages does not queue up. */
export const PULSE_MS = 620;

/** SMIL is not covered by the `prefers-reduced-motion` block in styles.css,
 *  which only reaches CSS animations. The bead has to opt out by hand. */
const STILL = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Where a line from one node's centre to another's crosses the first node's
 *  border. Wires leave from the side that faces the peer, so two agents
 *  side by side are joined across the gap between them rather than by a loop
 *  over the top. Anchoring to fixed handles produced exactly that loop. */
function borderPoint(from: InternalNode<Node>, to: InternalNode<Node>) {
  const w = (from.measured.width ?? 0) / 2;
  const h = (from.measured.height ?? 0) / 2;
  const cx = from.internals.positionAbsolute.x + w;
  const cy = from.internals.positionAbsolute.y + h;
  const tx = to.internals.positionAbsolute.x + (to.measured.width ?? 0) / 2;
  const ty = to.internals.positionAbsolute.y + (to.measured.height ?? 0) / 2;

  if (w === 0 || h === 0) return { x: cx, y: cy };

  // Normalise into a unit diamond, then scale back out: the standard trick
  // for hitting a rectangle's edge without four separate cases.
  const u = (tx - cx) / (2 * w) - (ty - cy) / (2 * h);
  const v = (tx - cx) / (2 * w) + (ty - cy) / (2 * h);
  const scale = 1 / (Math.abs(u) + Math.abs(v) || 1);
  const su = scale * u;
  const sv = scale * v;
  return { x: w * (su + sv) + cx, y: h * (sv - su) + cy };
}

/** Which side of the node the wire leaves from, so the curve bends outward. */
function sideOf(node: InternalNode<Node>, p: { x: number; y: number }): Position {
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  if (p.x <= x + 1) return Position.Left;
  if (p.x >= x + w - 1) return Position.Right;
  if (p.y <= y + 1) return Position.Top;
  return Position.Bottom;
}

/** The wire between two agents is the only visible evidence that they talk to
 *  each other, so it earns its own edge component. At rest it is quiet. While
 *  either end is working it brightens and a dotted current drifts along it.
 *  Every message sends a bead down it, in the direction the message went. */
function WireEdgeInner({ id, source, target, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const pulse = useStore((s) => s.pulses[id]);
  const live = useStore(
    (s) => s.statuses[source] === "running" || s.statuses[target] === "running"
  );

  const motionRef = useRef<SVGElement>(null);
  const fadeRef = useRef<SVGElement>(null);
  const seq = pulse?.seq ?? 0;

  useEffect(() => {
    if (seq === 0 || STILL.matches) return;
    // SMIL measures `begin` from the start of the SVG document timeline, not
    // from when the element mounts. A bead added minutes into a session is
    // therefore already past its end time and snaps straight to the frozen
    // end state without ever moving. Starting it by hand is what actually
    // replays it, and it also lets one element serve every message.
    (motionRef.current as SVGAnimationElement | null)?.beginElement();
    (fadeRef.current as SVGAnimationElement | null)?.beginElement();
  }, [seq]);

  if (!sourceNode || !targetNode) return null;

  const from = borderPoint(sourceNode, targetNode);
  const to = borderPoint(targetNode, sourceNode);

  const [d] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: sideOf(sourceNode, from),
    targetX: to.x,
    targetY: to.y,
    targetPosition: sideOf(targetNode, to),
    curvature: 0.24,
  });

  return (
    <g className={`wire ${live ? "is-live" : ""} ${selected ? "is-sel" : ""}`}>
      <path className="wire-halo" d={d} />
      <BaseEdge id={id} path={d} interactionWidth={18} />
      {live && <path className="wire-flow" d={d} />}
      {/* Rests invisible at one end and is driven by the effect above, so the
          bead costs nothing on a wire that has never carried a message. */}
      <circle className="wire-bead" r="3.6" opacity="0">
        <animateMotion
          ref={motionRef}
          begin="indefinite"
          dur={`${PULSE_MS}ms`}
          path={d}
          calcMode="linear"
          keyPoints={pulse?.reverse ? "1;0" : "0;1"}
          keyTimes="0;1"
          fill="freeze"
        />
        <animate
          ref={fadeRef}
          begin="indefinite"
          attributeName="opacity"
          dur={`${PULSE_MS}ms`}
          values="0;1;1;0"
          keyTimes="0;0.12;0.72;1"
          fill="freeze"
        />
      </circle>
    </g>
  );
}

export default memo(WireEdgeInner);
