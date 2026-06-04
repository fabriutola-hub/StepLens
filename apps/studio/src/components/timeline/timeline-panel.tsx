"use client";

import { useEffect } from "react";
import { ReplayControls } from "@/components/replay/replay-controls";
import { ReplayProgress } from "@/components/replay/replay-progress";
import { TimelineView } from "@/components/timeline/timeline-view";
import { useReplay } from "@/stores/replay-store";
import { useSelection } from "@/stores/selection-store";
import type { TimelineItem } from "@/lib/timeline";

interface TimelinePanelProps {
  items: TimelineItem[];
  traceStart: number;
  traceEnd: number;
}

/**
 * Timeline tab with step-by-step replay.
 *
 * "Replay" here means walking the recorded trace event-by-event — play/pause,
 * step, and seek along the playhead — not re-executing the agent. The controls
 * drive the playhead; the timeline dims not-yet-reached events and highlights
 * the current one, and the inspector follows along.
 */
export function TimelinePanel({ items, traceStart, traceEnd }: TimelinePanelProps) {
  const reset = useReplay((s) => s.reset);
  const playing = useReplay((s) => s.playing);
  const currentEventIndex = useReplay((s) => s.currentEventIndex);
  const select = useSelection((s) => s.select);

  // Reset replay state whenever the trace changes.
  useEffect(() => {
    reset(traceStart);
  }, [traceStart, items.length, reset]);

  // Replay is "engaged" once the user plays or steps off the first event.
  const replayActive = playing || currentEventIndex > 0;

  // Mirror the current replay event into the inspector. Keyed on the index
  // (which only changes at event boundaries), so this does not fire per frame.
  const activeId = items[currentEventIndex]?.id;
  useEffect(() => {
    if (!replayActive || !activeId) return;
    const item = items.find((i) => i.id === activeId);
    if (item) select(item);
  }, [activeId, replayActive, items, select]);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No events recorded for this trace.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-2 border-b p-3">
        <ReplayProgress items={items} traceStart={traceStart} traceEnd={traceEnd} />
        <ReplayControls items={items} traceStart={traceStart} traceEnd={traceEnd} />
      </div>
      <TimelineView
        items={items}
        traceStart={traceStart}
        traceEnd={traceEnd}
        activeIndex={replayActive ? currentEventIndex : undefined}
      />
    </div>
  );
}
