import { useEffect } from "react";
import { useStore } from "../store";

const KEYS: [string, string][] = [
  ["⌘K", "Focus the command bar"],
  ["⌘S", "Save the workspace"],
  ["⌘F", "Find an agent or note"],
  ["⌘.", "Interrupt everything running"],
  ["⌘\\", "Toggle Focus mode"],
  ["?", "Show this list"],
  ["Esc", "Clear search, close menus"],
  ["Right-click", "Node and canvas menus"],
  ["Drag a green dot", "Connect two agents"],
];

export default function Shortcuts() {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={() => setOpen(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span>Keyboard</span>
          <button className="win-btn" onClick={() => setOpen(false)} title="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">
          {KEYS.map(([k, label]) => (
            <div key={k} className="key-row">
              <kbd>{k}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
