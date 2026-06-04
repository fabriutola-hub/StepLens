"use client";

/**
 * Activity heat map — 12 weeks × 7 days grid, intensity = number of traces
 * started that day. Click a cell to set `from` and `to` in the parent
 * filter set; click again on the active cell to clear.
 */
import { useEffect, useMemo, useState } from "react";
import { getActivity, type ActivityResponse } from "@/lib/api";
import { useI18n } from "@/lib/use-i18n";
import { cn } from "@/lib/utils";

interface ActivityHeatmapProps {
  /** Filter set; we update from/to when the user clicks a cell. */
  onSelectDay: (day: { from: number; to: number } | null) => void;
  /** Current active day-bucket, if any. */
  activeBucket?: number | null;
  className?: string;
}

function localOffsetMinutes(): number {
  if (typeof Intl !== "undefined") {
    return -new Date().getTimezoneOffset();
  }
  return 0;
}

function intensity(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  // 5 levels: 0 = no traces, 1..4 = 20/40/60/80% of max.
  const ratio = count / max;
  if (ratio > 0.8) return 4;
  if (ratio > 0.6) return 3;
  if (ratio > 0.4) return 2;
  if (ratio > 0.2) return 1;
  return 1;
}

const CELL_BG = [
  "bg-muted",
  "bg-emerald-200 dark:bg-emerald-900/40",
  "bg-emerald-300 dark:bg-emerald-700/50",
  "bg-emerald-400 dark:bg-emerald-500/70",
  "bg-emerald-500 dark:bg-emerald-400",
];

const DAY_LABELS = ["Mon", "Wed", "Fri"]; // sparse labels for less clutter

export function ActivityHeatmap({
  onSelectDay,
  activeBucket,
  className,
}: ActivityHeatmapProps) {
  const { t } = useI18n();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    getActivity({ tzOffsetMinutes: localOffsetMinutes() })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build a 12 × 7 grid (col = week, row = weekday Mon..Sun).
  // `todayBucket` is a stable anchor; it advances only when the user keeps
  // the tab open across a day boundary, which we don't try to auto-refresh.
  // (Studio's poll cycle naturally re-renders the workbench every 3s and
  //  unmounts/remounts the heat map with a fresh anchor.)
  const [anchor] = useState(() => Math.floor(Date.now() / 86_400_000));
  const grid = useMemo(() => {
    if (!data) return null;
    const todayBucket = anchor + Math.floor(data.tz * 60_000 / 86_400_000);
    const weeks = 12;
    // ISO weekday: Mon=1..Sun=7. Convert to 0..6 (Mon=0).
    const startBucket = todayBucket - (weeks - 1) * 7 - 6;
    const cells: Array<{ bucket: number; count: number; isToday: boolean }> = [];
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const b = startBucket + w * 7 + d;
        const count = data.counts[String(b)] ?? 0;
        const isToday = b === todayBucket;
        cells.push({ bucket: b, count, isToday });
      }
    }
    return { cells, startBucket, todayBucket };
  }, [data, anchor]);

  const max = useMemo(() => {
    if (!grid) return 0;
    return grid.cells.reduce((m, c) => Math.max(m, c.count), 0);
  }, [grid]);

  if (loading && !data) {
    return (
      <div className={cn("h-20 animate-pulse rounded-lg bg-muted/60", className)} />
    );
  }
  if (!grid) return null;

  // Column labels: month if it changes
  const monthLabels: Array<{ x: number; label: string }> = [];
  let lastMonth = -1;
  for (let w = 0; w < 12; w++) {
    const cell = grid.cells[w * 7];
    const d = new Date(cell.bucket * 86_400_000);
    const m = d.getUTCMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push({
        x: w,
        label: d.toLocaleString(undefined, { month: "short" }),
      });
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("heatmap.title")}
        </h3>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{t("heatmap.legend.less")}</span>
          {CELL_BG.map((c, i) => (
            <span key={i} className={cn("inline-block size-2.5 rounded-sm", c)} />
          ))}
          <span>{t("heatmap.legend.more")}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="ml-6 grid h-3 grid-cols-12 text-[10px] text-muted-foreground">
            {monthLabels.map((m) => (
              <span
                key={`${m.x}-${m.label}`}
                style={{ gridColumnStart: m.x + 1 }}
                className="truncate"
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-0.5">
            <div className="mr-1 flex w-5 flex-col gap-0.5 text-[10px] text-muted-foreground">
              {DAY_LABELS.map((l, i) => (
                <span
                  key={l}
                  className="h-3 leading-3"
                  style={{ visibility: i === 0 ? "visible" : "hidden" }}
                >
                  {l}
                </span>
              ))}
              <span className="h-3" />
              <span className="h-3 leading-3">{DAY_LABELS[1]}</span>
              <span className="h-3" />
              <span className="h-3" />
              <span className="h-3 leading-3">{DAY_LABELS[2]}</span>
            </div>
            <div className="grid grid-cols-12 gap-0.5">
              {Array.from({ length: 12 }, (_, w) => (
                <div key={w} className="grid grid-rows-7 gap-0.5">
                  {grid.cells.slice(w * 7, w * 7 + 7).map((cell) => {
                    const level = intensity(cell.count, max);
                    const active = activeBucket === cell.bucket;
                    return (
                      <button
                        key={cell.bucket}
                        type="button"
                        title={
                          cell.count === 0
                            ? t("heatmap.tooltip.zero", {
                                date: new Date(cell.bucket * 86_400_000)
                                  .toISOString()
                                  .slice(0, 10),
                              })
                            : cell.count === 1
                              ? t("heatmap.tooltip.one", {
                                  date: new Date(cell.bucket * 86_400_000)
                                    .toISOString()
                                    .slice(0, 10),
                                })
                              : t("heatmap.tooltip.many", {
                                  count: cell.count,
                                  date: new Date(cell.bucket * 86_400_000)
                                    .toISOString()
                                    .slice(0, 10),
                                })
                        }
                        onClick={() => {
                          if (active) {
                            onSelectDay(null);
                            return;
                          }
                          const start = cell.bucket * 86_400_000 - data!.tz * 60_000;
                          onSelectDay({
                            from: start,
                            to: start + 86_400_000 - 1,
                          });
                        }}
                        className={cn(
                          "size-3 rounded-sm transition-all hover:ring-1 hover:ring-foreground/40",
                          CELL_BG[level],
                          active && "ring-2 ring-primary",
                          cell.isToday && "ring-1 ring-foreground/30"
                        )}
                        aria-label={`${cell.count} traces`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
