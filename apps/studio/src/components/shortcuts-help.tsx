"use client";

/**
 * Shortcut help overlay — opened with `?`. Lists every shortcut that any
 * component on the current page has registered via `useShortcut`.
 */
import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCombo,
  useShortcut,
  useShortcutList,
  type Shortcut,
} from "@/lib/shortcuts";

function groupBy(shortcuts: Shortcut[]): Record<string, Shortcut[]> {
  return shortcuts.reduce<Record<string, Shortcut[]>>((acc, s) => {
    const group = s.group ?? "General";
    if (!acc[group]) acc[group] = [];
    acc[group].push(s);
    return acc;
  }, {});
}

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useShortcut({
    key: "?",
    shift: true,
    description: "Show keyboard shortcuts",
    group: "Help",
    handler: () => setOpen((o) => !o),
  });
  useShortcut({
    key: "Escape",
    description: "Close help overlay",
    group: "Help",
    handler: () => setOpen(false),
  });

  const shortcuts = useShortcutList();

  if (!open) return null;

  const grouped = groupBy(
    // The Help group is internal — don't show "?" → "Show keyboard shortcuts"
    // as the main thing in the overlay.
    shortcuts.filter((s) => s.group !== "Help")
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts overlay"
          >
            <X className="size-4" />
          </Button>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shortcuts registered on this page.
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {items.map((s, i) => (
                    <li
                      key={`${s.key}-${i}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span>{s.description}</span>
                      <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                        {formatCombo(s)}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Press <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">?</kbd>{" "}
          again to close.
        </p>
      </div>
    </div>
  );
}
