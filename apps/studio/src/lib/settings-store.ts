/**
 * Workspace settings store — persisted to localStorage with a versioned key.
 *
 * Versioning the key means that if we change the schema in a breaking way
 * (rename a field, change a type), we can ship a new version number and the
 * old value is silently ignored instead of crashing on parse. Migrations
 * happen at read time.
 */

const STORAGE_KEY = "steplens.settings.v1";

export type Locale = "en" | "es";
export type PageSize = 10 | 25 | 50 | 100;

export interface BudgetSettings {
  /** Daily USD budget; 0 disables the alert. */
  dailyUsd: number;
  /** Monthly USD budget; 0 disables the alert. */
  monthlyUsd: number;
}

export interface WorkspaceSettings {
  /** Polling interval for the live workbench refresh, in ms. */
  pollIntervalMs: number;
  /** Default page size for the trace list. */
  defaultPageSize: PageSize;
  /** Compact table rows (denser typography, narrower padding). */
  compactMode: boolean;
  /** Preferred UI locale; `"system"` means follow the browser. */
  locale: Locale | "system";
  /** Default sort field for the workbench. */
  defaultSort: "startedAt" | "durationMs" | "name" | "status";
  /** Enable Server-Sent Events live updates instead of polling. */
  liveUpdates: boolean;
  /** Cost budgets — banner shows when filtered view exceeds. */
  budget: BudgetSettings;
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  pollIntervalMs: 3000,
  defaultPageSize: 25,
  compactMode: false,
  locale: "system",
  defaultSort: "startedAt",
  liveUpdates: true,
  budget: { dailyUsd: 0, monthlyUsd: 0 },
};

function isPageSize(n: unknown): n is PageSize {
  return n === 10 || n === 25 || n === 50 || n === 100;
}

/**
 * Read settings from localStorage. Always returns a complete object — missing
 * fields fall back to defaults so adding a new key never breaks an existing
 * user's settings.
 */
export function readSettings(): WorkspaceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSettings>;
    return mergeWithDefaults(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Persist settings; emits a `storage` event so other tabs/components react. */
export function writeSettings(next: WorkspaceSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Same-window writes don't fire the standard `storage` event.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  } catch {
    // localStorage may be disabled (private mode, quota) — ignore silently.
  }
}

/** Merge a partial blob into the full settings shape with safe coercion. */
export function mergeWithDefaults(
  partial: Partial<WorkspaceSettings>
): WorkspaceSettings {
  const safe = { ...DEFAULT_SETTINGS };

  if (
    typeof partial.pollIntervalMs === "number" &&
    partial.pollIntervalMs >= 500 &&
    partial.pollIntervalMs <= 60_000
  ) {
    safe.pollIntervalMs = partial.pollIntervalMs;
  }
  if (isPageSize(partial.defaultPageSize)) {
    safe.defaultPageSize = partial.defaultPageSize;
  }
  if (typeof partial.compactMode === "boolean") {
    safe.compactMode = partial.compactMode;
  }
  if (
    partial.locale === "en" ||
    partial.locale === "es" ||
    partial.locale === "system"
  ) {
    safe.locale = partial.locale;
  }
  if (
    partial.defaultSort === "startedAt" ||
    partial.defaultSort === "durationMs" ||
    partial.defaultSort === "name" ||
    partial.defaultSort === "status"
  ) {
    safe.defaultSort = partial.defaultSort;
  }
  if (typeof partial.liveUpdates === "boolean") {
    safe.liveUpdates = partial.liveUpdates;
  }
  if (partial.budget && typeof partial.budget === "object") {
    safe.budget = {
      dailyUsd:
        typeof partial.budget.dailyUsd === "number" &&
        partial.budget.dailyUsd >= 0
          ? partial.budget.dailyUsd
          : 0,
      monthlyUsd:
        typeof partial.budget.monthlyUsd === "number" &&
        partial.budget.monthlyUsd >= 0
          ? partial.budget.monthlyUsd
          : 0,
    };
  }
  return safe;
}

/** For tests — clears the stored value. */
export function resetSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const STORAGE_KEY_NAME = STORAGE_KEY;
