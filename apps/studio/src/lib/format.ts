/**
 * Shared display formatters used across the workbench, detail, and compare
 * views so durations, timestamps, and statuses render consistently.
 */

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "just now";
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Signed duration delta, e.g. "+1.2s" / "-340ms" / "0ms". */
export function formatDeltaMs(ms: number): string {
  if (ms === 0) return "0ms";
  const sign = ms > 0 ? "+" : "-";
  return `${sign}${formatDuration(Math.abs(ms))}`;
}

export type StatusVariant = "default" | "secondary" | "destructive" | "outline";

export function statusVariant(status: string): StatusVariant {
  switch (status) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}
