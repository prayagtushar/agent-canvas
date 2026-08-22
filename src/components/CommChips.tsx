import { api } from "../api";
import { useStore } from "../store";

/** Agent-to-agent chatter can loop. These chips make the switch and the
 *  remaining budget visible at all times, not buried in a settings menu. */
export default function CommChips() {
  const comm = useStore((s) => s.comm);
  const pushToast = useStore((s) => s.pushToast);

  const nearCap = comm.cap > 0 && comm.sent >= comm.cap * 0.8;
  const atCap = comm.sent >= comm.cap;

  const toggle = () => {
    const next = !comm.autoComm;
    void api.setAutoComm(next).catch((e) => pushToast("err", String(e)));
    pushToast("ok", next ? "Agents can message each other." : "Agent messaging is off.");
  };

  const bumpCap = () => {
    const next = comm.cap + 200;
    void api.setMessageCap(next).catch((e) => pushToast("err", String(e)));
    pushToast("ok", `Message cap raised to ${next}.`);
  };

  const reset = () => {
    void api.resetMessageCount().catch((e) => pushToast("err", String(e)));
    pushToast("ok", "Message count reset.");
  };

  return (
    <div className="comm-chips">
      <button
        className={`chip ${comm.autoComm ? "chip-on" : ""}`}
        title={
          comm.autoComm
            ? "Agents may message each other. Click to stop it."
            : "Agent messaging is off. Click to allow it."
        }
        onClick={toggle}
      >
        <span className={`chip-dot ${comm.autoComm ? "live" : ""}`} />
        Auto-comm {comm.autoComm ? "on" : "off"}
      </button>

      <button
        className={`chip ${atCap ? "chip-alert" : nearCap ? "chip-warn" : ""}`}
        title={
          atCap
            ? "Cap reached. Click to raise it by 200."
            : "Messages relayed between agents. Click to raise the cap."
        }
        onClick={atCap || nearCap ? bumpCap : reset}
      >
        {comm.sent}/{comm.cap}
      </button>
    </div>
  );
}
