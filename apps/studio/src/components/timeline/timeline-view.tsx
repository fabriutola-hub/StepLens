"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useSelection } from "@/stores/selection-store";
import type { TimelineItem } from "@/lib/timeline";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 36; // px per timeline row
const CATEGORY_LABELS: Record<string, string> = {
  event: "Event",
  span: "Span",
  model_call: "Model",
  tool_call: "Tool",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface TimelineViewProps {
  items: TimelineItem[];
  traceStart: number;
  traceEnd: number;
  /**
   * Index of the event the replay playhead is currently at. When provided,
   * events after it are dimmed and the current one is highlighted — turning
   * the timeline into a step-by-step replay view.
   */
  activeIndex?: number;
}

// ── Component ───────────────────────────────────────────────────────────────

export function TimelineView({ items, traceStart, traceEnd, activeIndex }: TimelineViewProps) {
  const { selectedId, select } = useSelection();
  const totalDuration = Math.max(traceEnd - traceStart, 1);

  // Generate time ruler marks
  const rulerMarks = useMemo(() => {
    const marks: { label: string; leftPct: number }[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const pct = (i / steps) * 100;
      const ts = traceStart + (totalDuration * i) / steps;
      marks.push({
        label: formatRulerLabel(ts - traceStart, totalDuration),
        leftPct: pct,
      });
    }
    return marks;
  }, [traceStart, totalDuration]);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No events recorded for this trace.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Time Ruler ──────────────────────────────────────────────── */}
      <div className="relative h-6 border-b border-border/50">
        {rulerMarks.map((mark, i) => (
          <div
            key={i}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${mark.leftPct}%` }}
          >
            <div className="h-2 w-px bg-border" />
            <span className="mt-0.5 text-[10px] text-muted-foreground/60">
              {mark.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Timeline Rows ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-px">
        {items.map((item, index) => {
          const isSelected = selectedId === item.id;
          const isCurrent = activeIndex != null && index === activeIndex;
          const isFuture = activeIndex != null && index > activeIndex;
          return (
            <TimelineRow
              key={item.id}
              item={item}
              isSelected={isSelected}
              isCurrent={isCurrent}
              isFuture={isFuture}
              onClick={() => select(item)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline Row ────────────────────────────────────────────────────────────

interface TimelineRowProps {
  item: TimelineItem;
  isSelected: boolean;
  isCurrent?: boolean;
  isFuture?: boolean;
  onClick: () => void;
}

function TimelineRow({ item, isSelected, isCurrent, isFuture, onClick }: TimelineRowProps) {
  const durLabel = item.durationMs != null ? formatDuration(item.durationMs) : "instant";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 px-4 text-left transition-all",
        isSelected
          ? "bg-accent"
          : "hover:bg-muted/50",
        isCurrent && "bg-primary/10 ring-1 ring-inset ring-primary/40",
        isFuture && "opacity-40"
      )}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Category label */}
      <span className="w-14 shrink-0 text-[11px] font-medium text-muted-foreground">
        {CATEGORY_LABELS[item.category] ?? item.category}
      </span>

      {/* Bar area */}
      <div className="relative h-5 flex-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className={cn(
                  "absolute top-0 h-full rounded-sm transition-opacity cursor-pointer",
                  item.color,
                  isSelected ? "opacity-100" : "opacity-80 group-hover:opacity-100"
                )}
                style={{
                  left: `${item.leftPct}%`,
                  width: `${Math.max(item.widthPct, 0.5)}%`,
                  minWidth: 6,
                }}
              />
            }
          />
          <TooltipContent side="top" className="text-xs">
            <p className="font-medium">{item.name}</p>
            <p className="text-muted-foreground">{durLabel} · {item.subLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Name */}
      <span className="w-40 shrink-0 truncate text-xs font-medium sm:w-52">
        {item.name}
      </span>

      {/* Duration */}
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {durLabel}
      </span>
    </button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

function formatRulerLabel(offsetMs: number, totalMs: number): string {
  if (totalMs < 5000) return `${offsetMs.toFixed(0)}ms`;
  if (totalMs < 60_000) return `${(offsetMs / 1000).toFixed(1)}s`;
  return `${(offsetMs / 1000).toFixed(0)}s`;
}
