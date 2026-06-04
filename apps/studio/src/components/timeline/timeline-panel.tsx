"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReplayControls } from "@/components/replay/replay-controls";
import { ReplayProgress } from "@/components/replay/replay-progress";
import { TimelineView } from "@/components/timeline/timeline-view";
import { useReplay } from "@/stores/replay-store";
import { useSelection } from "@/stores/selection-store";
import type { TimelineItem, TimelineCategory } from "@/lib/timeline";
import { cn } from "@/lib/utils";

interface TimelinePanelProps {
  items: TimelineItem[];
  traceStart: number;
  traceEnd: number;
}

const CATEGORY_FILTERS: { value: TimelineCategory; label: string }[] = [
  { value: "span", label: "Spans" },
  { value: "model_call", label: "Models" },
  { value: "tool_call", label: "Tools" },
  { value: "event", label: "Events" },
];

const STATUS_FILTERS = ["all", "success", "error", "running"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Timeline tab with step-by-step replay, category/status filtering, and an
 * in-trace search. Filters apply to the items the replay walks, so play/step
 * follows the filtered subset.
 */
export function TimelinePanel({ items, traceStart, traceEnd }: TimelinePanelProps) {
  const reset = useReplay((s) => s.reset);
  const playing = useReplay((s) => s.playing);
  const currentEventIndex = useReplay((s) => s.currentEventIndex);
  const select = useSelection((s) => s.select);

  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Set<TimelineCategory>>(
    () => new Set(CATEGORY_FILTERS.map((c) => c.value))
  );
  const [status, setStatus] = useState<StatusFilter>("all");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!categories.has(item.category)) return false;
      if (status !== "all" && item.status !== status) return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !item.subLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [items, categories, status, search]);

  // Reset replay state whenever the trace or the filtered set changes.
  useEffect(() => {
    reset(traceStart);
  }, [traceStart, filteredItems.length, reset]);

  const replayActive = playing || currentEventIndex > 0;

  const activeId = filteredItems[currentEventIndex]?.id;
  useEffect(() => {
    if (!replayActive || !activeId) return;
    const item = filteredItems.find((i) => i.id === activeId);
    if (item) select(item);
  }, [activeId, replayActive, filteredItems, select]);

  const toggleCategory = (cat: TimelineCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No events recorded for this trace.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search timeline…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-48 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          {CATEGORY_FILTERS.map((cat) => (
            <Button
              key={cat.value}
              size="xs"
              variant={categories.has(cat.value) ? "secondary" : "outline"}
              onClick={() => toggleCategory(cat.value)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="xs"
              variant={status === s ? "default" : "ghost"}
              onClick={() => setStatus(s)}
              className={cn("capitalize", s === "all" && "lowercase")}
            >
              {s === "all" ? "any status" : s}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredItems.length} / {items.length}
        </span>
      </div>

      {/* ── Replay controls ─────────────────────────────────────────── */}
      <div className="space-y-2 border-b p-3">
        <ReplayProgress
          items={filteredItems}
          traceStart={traceStart}
          traceEnd={traceEnd}
        />
        <ReplayControls
          items={filteredItems}
          traceStart={traceStart}
          traceEnd={traceEnd}
        />
      </div>

      {filteredItems.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No timeline items match these filters.
        </div>
      ) : (
        <TimelineView
          items={filteredItems}
          traceStart={traceStart}
          traceEnd={traceEnd}
          activeIndex={replayActive ? currentEventIndex : undefined}
        />
      )}
    </div>
  );
}
