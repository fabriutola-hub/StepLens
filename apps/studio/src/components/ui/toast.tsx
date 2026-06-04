"use client";

/**
 * Minimal toast system — no extra dependencies. A single store backs a top-
 * right stack rendered by `<Toaster />` in the root layout, and any client
 * component can call `toast.success(...) | error(...) | info(...)`.
 *
 * Why custom (not radix/sonner): Studio's bundle stays lean and the API is
 * one file. Animations come from `tw-animate-css` we already ship.
 */
import { useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** ms until auto-dismiss; 0 disables. */
  durationMs: number;
}

type Listener = () => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return toasts;
}

let counter = 0;

function push(kind: ToastKind, title: string, opts: { description?: string; durationMs?: number } = {}) {
  counter += 1;
  const id = `t-${counter}`;
  const t: Toast = {
    id,
    kind,
    title,
    description: opts.description,
    durationMs: opts.durationMs ?? 3500,
  };
  toasts = [...toasts, t];
  emit();
  if (t.durationMs > 0) {
    setTimeout(() => dismiss(id), t.durationMs);
  }
  return id;
}

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (title: string, opts?: { description?: string; durationMs?: number }) =>
    push("success", title, opts),
  error: (title: string, opts?: { description?: string; durationMs?: number }) =>
    push("error", title, opts ?? { durationMs: 5000 }),
  info: (title: string, opts?: { description?: string; durationMs?: number }) =>
    push("info", title, opts),
  dismiss,
};

// ── Renderer ────────────────────────────────────────────────────────────────

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const STYLES: Record<ToastKind, string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => toasts);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 top-16 z-[100] flex w-80 flex-col gap-2"
    >
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border bg-card p-3 shadow-md animate-in slide-in-from-right-2 fade-in",
              STYLES[t.kind]
            )}
          >
            <Icon className="size-4 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs opacity-80">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
