"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  readSettings,
  writeSettings,
  STORAGE_KEY_NAME,
  type WorkspaceSettings,
} from "./settings-store";

const subscribe = (l: () => void) => {
  const handler = (e: StorageEvent) => {
    // Only react to our own key — saves a re-render for unrelated writes.
    if (e.key === null || e.key === STORAGE_KEY_NAME) l();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
};

const getSnapshot = (): WorkspaceSettings => readSettings();
const getServerSnapshot = (): WorkspaceSettings => DEFAULT_SETTINGS;

/**
 * React hook that returns the current settings + a mutator. Renders never
 * read from localStorage during render — `useSyncExternalStore` handles the
 * subscription, and `set` writes-through immediately so other components
 * (including other tabs) re-render with the new value.
 */
export function useSettings(): {
  settings: WorkspaceSettings;
  set: (patch: Partial<WorkspaceSettings>) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    settings,
    set: (patch) => {
      const next = { ...settings, ...patch };
      writeSettings(next);
    },
    reset: () => writeSettings(DEFAULT_SETTINGS),
  };
}
