"use client";

/**
 * Global keyboard shortcut registry — no extra dependencies. A single
 * `keydown` listener on the document dispatches to registered handlers.
 *
 * Hooks register a shortcut for as long as they live; we ignore key presses
 * that originate inside form controls so typing into the search box doesn't
 * accidentally trigger another shortcut.
 */
import { useEffect, useSyncExternalStore } from "react";

export interface Shortcut {
  /** Lower-case key name. Use plain letters; we handle modifiers below. */
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Human-friendly description for the help overlay. */
  description: string;
  /** Optional group label so the overlay can section them. */
  group?: string;
  handler: (e: KeyboardEvent) => void;
}

const registry: Set<Shortcut> = new Set();
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

const getSnapshot = () => registry;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function matches(s: Shortcut, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
  // Treat undefined as "must not be pressed" so a plain "g" shortcut doesn't
  // also fire on Ctrl+G.
  if (Boolean(s.meta) !== e.metaKey) return false;
  if (Boolean(s.ctrl) !== e.ctrlKey) return false;
  if (Boolean(s.shift) !== e.shiftKey) return false;
  if (Boolean(s.alt) !== e.altKey) return false;
  return true;
}

let installed = false;
function installListener() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("keydown", (e) => {
    // Plain "/" is allowed everywhere because it's a focus-the-search idiom
    // many editors use; everything else is suppressed inside form fields.
    const isSlash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (isTypingTarget(e.target) && !isSlash) return;
    for (const s of registry) {
      if (matches(s, e)) {
        e.preventDefault();
        s.handler(e);
      }
    }
  });
}

/** Register a global shortcut for the lifetime of the calling component. */
export function useShortcut(shortcut: Shortcut) {
  useEffect(() => {
    installListener();
    registry.add(shortcut);
    emit();
    return () => {
      registry.delete(shortcut);
      emit();
    };
    // We intentionally re-register if any field of `shortcut` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shortcut.key,
    shortcut.meta,
    shortcut.ctrl,
    shortcut.shift,
    shortcut.alt,
    shortcut.description,
    shortcut.group,
    shortcut.handler,
  ]);
}

/** Read the currently-registered shortcut set (for the help overlay). */
export function useShortcutList(): Shortcut[] {
  const set = useSyncExternalStore(subscribe, getSnapshot, () => registry);
  return Array.from(set);
}

/** Render-friendly representation of a keyboard combo. */
export function formatCombo(s: Shortcut): string {
  const parts: string[] = [];
  if (s.meta) parts.push("⌘");
  if (s.ctrl) parts.push("Ctrl");
  if (s.shift) parts.push("Shift");
  if (s.alt) parts.push("Alt");
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join(" + ");
}
