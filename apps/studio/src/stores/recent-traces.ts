"use client";

/**
 * Recent traces — the most recent N trace ids the user has opened. Kept in
 * localStorage so it survives reloads, but read in a way that doesn't
 * require the values to land before first paint.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "steplens.recent-traces.v1";
const MAX = 5;

export interface RecentEntry {
  id: string;
  name: string;
  viewedAt: number;
}

function read(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === "object" &&
        e != null &&
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        typeof e.viewedAt === "number"
    );
  } catch {
    return [];
  }
}

function write(next: RecentEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  } catch {
    // ignore
  }
}

const subscribe = (l: () => void) => {
  const handler = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) l();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
};

const getSnapshot = (): RecentEntry[] => read();
const getServerSnapshot = (): RecentEntry[] => [];

/** Push a trace to the front of the recent list, dedup by id. */
export function pushRecent(id: string, name: string): void {
  const current = read();
  const filtered = current.filter((e) => e.id !== id);
  const next: RecentEntry[] = [
    { id, name, viewedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX);
  write(next);
}

export function clearRecent(): void {
  write([]);
}

export function useRecentTraces(): RecentEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
