"use client";

/**
 * Lightweight confirm dialog — no extra dependencies, no portal complexity.
 * The shared store + `<ConfirmDialogHost />` in the root layout means any
 * client component can do `if (await confirmAction({...})) { ... }`.
 */
import { useSyncExternalStore } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual emphasis: "destructive" colors the confirm button red. */
  variant?: "default" | "destructive";
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let active: ActiveConfirm | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const getSnapshot = () => active;

/** Open a confirm dialog and resolve to true (confirm) or false (cancel/esc). */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // If something was already open, deny it so the new prompt takes over.
    active?.resolve(false);
    active = { ...options, resolve };
    emit();
  });
}

function close(ok: boolean) {
  const a = active;
  active = null;
  emit();
  a?.resolve(ok);
}

export function ConfirmDialogHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (!current) return null;

  const {
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "default",
  } = current;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") close(true);
      }}
      // The wrapper is the focus trap; tabbing inside stays inside the modal
      // because there's nothing else interactable while it's open.
      tabIndex={-1}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "shrink-0 rounded-full p-2",
              variant === "destructive"
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-foreground"
            )}
          >
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => close(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
