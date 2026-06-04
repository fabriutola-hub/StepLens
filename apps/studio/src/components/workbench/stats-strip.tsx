"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration, formatNumber } from "@/lib/format";
import { formatCostUsd } from "@/lib/timeline";
import type { TraceStats } from "@/lib/api";

interface StatsStripProps {
  stats: TraceStats | null;
  loading: boolean;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-[7rem] flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums" title={hint}>
        {value}
      </span>
    </div>
  );
}

export function StatsStrip({ stats, loading }: StatsStripProps) {
  if (loading && !stats) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[3.75rem] w-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const errorPct = (stats.errorRate * 100).toFixed(stats.errorRate ? 1 : 0);

  return (
    <div className="flex flex-wrap gap-2">
      <Stat label="Traces" value={formatNumber(stats.total)} />
      <Stat
        label="Errors"
        value={`${formatNumber(stats.errorCount)} · ${errorPct}%`}
        hint="Traces that errored"
      />
      <Stat
        label="Avg"
        value={formatDuration(stats.avgDurationMs)}
        hint="Average trace duration"
      />
      <Stat
        label="p95"
        value={formatDuration(stats.p95DurationMs)}
        hint="95th-percentile duration"
      />
      <Stat
        label="Tokens"
        value={formatNumber(stats.totalTokens)}
        hint="Total tokens across model calls"
      />
      <Stat
        label="Est. Cost"
        value={formatCostUsd(stats.estimatedCostUsd)}
        hint="Estimated cost in USD (static pricing)"
      />
    </div>
  );
}
