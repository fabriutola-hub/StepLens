"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  Cpu,
  Flame,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { computeHotspots, type Hotspot } from "@/lib/timeline";
import { formatCostUsd } from "@/lib/timeline";
import { formatDuration, formatNumber } from "@/lib/format";
import type { TraceDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SummaryPanelProps {
  detail: TraceDetail;
  /** Select the matching timeline/inspector item by row id. */
  onSelect: (id: string) => void;
}

function HotspotRow({
  hotspot,
  onSelect,
}: {
  hotspot: Hotspot;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(hotspot.id)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          hotspot.status === "error" ? "bg-red-500" : "bg-indigo-500"
        )}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{hotspot.label}</span>
      {hotspot.detail && (
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {hotspot.detail}
        </span>
      )}
      <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {formatDuration(hotspot.durationMs)}
      </span>
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  hotspots,
  onSelect,
  emptyHint,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  hotspots: Hotspot[];
  onSelect: (id: string) => void;
  emptyHint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="p-1.5">
        {hotspots.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {emptyHint ?? "Nothing recorded."}
          </p>
        ) : (
          hotspots.map((h) => (
            <HotspotRow key={h.id} hotspot={h} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  );
}

export function SummaryPanel({ detail, onSelect }: SummaryPanelProps) {
  const hotspots = useMemo(() => computeHotspots(detail), [detail]);

  return (
    <div className="space-y-4 p-4">
      {/* Totals */}
      <div className="flex flex-wrap gap-2">
        <Totals
          label="Tokens"
          value={formatNumber(hotspots.totalTokens)}
        />
        <Totals
          label="Est. Cost"
          value={formatCostUsd(hotspots.estimatedCostUsd)}
        />
        <Totals label="Errors" value={formatNumber(hotspots.errors.length)} />
      </div>

      {/* Critical */}
      {hotspots.critical.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-2 border-b border-amber-500/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <Flame className="size-3.5" />
            Needs attention
          </div>
          <div className="p-1.5">
            {hotspots.critical.map((h) => (
              <div key={h.id} className="flex items-center gap-2">
                <Badge
                  variant={h.status === "error" ? "destructive" : "outline"}
                  className="shrink-0 text-[10px]"
                >
                  {h.subLabel}
                </Badge>
                <div className="min-w-0 flex-1">
                  <HotspotRow hotspot={h} onSelect={onSelect} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Slowest spans"
          icon={Zap}
          hotspots={hotspots.slowestSpans}
          onSelect={onSelect}
          emptyHint="No spans recorded."
        />
        <Section
          title="Slowest model calls"
          icon={Cpu}
          hotspots={hotspots.slowestModelCalls}
          onSelect={onSelect}
          emptyHint="No model calls recorded."
        />
        <Section
          title="Slowest tools"
          icon={Wrench}
          hotspots={hotspots.slowestTools}
          onSelect={onSelect}
          emptyHint="No tool calls recorded."
        />
        <Section
          title="Errors"
          icon={AlertTriangle}
          hotspots={hotspots.errors}
          onSelect={onSelect}
          emptyHint="No errors — clean run."
        />
      </div>
    </div>
  );
}

function Totals({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[6rem] flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
