"use client";

/**
 * Theme management — three-way switch (`light` | `dark` | `system`) persisted
 * in localStorage and reflected on `<html class="dark">`.
 *
 * - The initial class is applied by a tiny inline script in the root layout so
 *   we don't flash the wrong theme on first paint.
 * - `useSyncExternalStore` avoids React 19's setState-in-effect lint by reading
 *   directly from localStorage and listening for `storage` events.
 */
import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "steplens.theme";
const VALID = new Set<ThemeChoice>(["light", "dark", "system"]);

function readChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && VALID.has(raw as ThemeChoice)) return raw as ThemeChoice;
  } catch {
    // localStorage blocked (private mode, etc.) — fall through to system.
  }
  return "system";
}

function effectiveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDocument(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const effective = effectiveTheme(choice);
  document.documentElement.classList.toggle("dark", effective === "dark");
  document.documentElement.style.colorScheme = effective;
}

/** Persist + emit. Callers should use `useTheme()` to read. */
export function setTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignore — still update the DOM so the toggle feels responsive.
  }
  applyToDocument(choice);
  // Same-window writes don't fire `storage`; broadcast manually so the toggle
  // re-renders in the same tab.
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

const subscribe = (l: () => void) => {
  // Cross-tab updates + our manual same-window broadcast both come through
  // the `storage` event, so one listener covers everything.
  window.addEventListener("storage", l);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    // System theme changed: only re-apply when the user is on "system".
    if (readChoice() === "system") {
      applyToDocument("system");
      l();
    }
  };
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener("storage", l);
    media.removeEventListener("change", onMedia);
  };
};

const getSnapshot = (): ThemeChoice => readChoice();
const getServerSnapshot = (): ThemeChoice => "system";

export function useTheme(): {
  choice: ThemeChoice;
  effective: "light" | "dark";
  set: (next: ThemeChoice) => void;
} {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `effective` is recomputed on every render — which is fine, it's a single
  // localStorage read + a media-query check, no allocations.
  const effective =
    typeof window === "undefined" ? "light" : effectiveTheme(choice);
  return { choice, effective, set: setTheme };
}

/**
 * Inline-script string that the root layout injects before hydration so the
 * correct class is on `<html>` before the first paint — no FOUC.
 */
export const THEME_INIT_SCRIPT = `(() => {
  try {
    var k = "${STORAGE_KEY}";
    var v = localStorage.getItem(k);
    if (v !== "light" && v !== "dark") {
      v = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.classList.toggle("dark", v === "dark");
    document.documentElement.style.colorScheme = v;
  } catch (_) {}
})();`;
