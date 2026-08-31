import { useEffect } from "react";
import { useStore } from "../store";

const KEYS: [string, string][] = [
  ["⌘K", "Focus the command bar"],
  ["↑ / ↓", "Recall a prompt you already sent"],
  ["⌘1…9", "Go to that agent and type in it"],
  ["⌘[ / ⌘]", "Previous / next agent"],
  ["⌘0", "Fit everything on screen"],
  ["⌘J", "Show what the agents said to each other"],
  ["⌘F", "Find an agent or note, Enter walks the matches"],
  ["⌘S", "Save the workspace"],
  ["⌘.", "Interrupt everything running"],
  ["⌘\\", "Toggle Focus mode"],
  ["⌘O", "See the canvas as an office"],
  ["?", "Show this list"],
  ["Esc", "Clear search, close panels"],
  ["Right-click", "Connect agents, and the canvas menu"],
  ["Double-click a name", "Rename that agent"],
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
