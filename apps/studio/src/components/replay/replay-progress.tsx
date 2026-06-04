"use client";

import { useMemo } from "react";
import { useReplay } from "@/stores/replay-store";
import type { TimelineItem } from "@/lib/timeline";

interface ReplayProgressProps {
  items: TimelineItem[];
  traceStart: number;
  traceEnd: number;
}

export function ReplayProgress({ items, traceStart, traceEnd }: ReplayProgressProps) {
  const { playhead, currentEventIndex, seek } = useReplay();

  const totalDuration = traceEnd - traceStart;
  const progressPct = totalDuration > 0 ? ((playhead - traceStart) / totalDuration) * 100 : 0;

  const markers = useMemo(() => {
    return items.map((item, index) => {
      const pct = totalDuration > 0 ? ((item.startTime - traceStart) / totalDuration) * 100 : 0;
      const isActive = index <= currentEventIndex;
      return { ...item, pct, isActive };
    });
  }, [items, traceStart, totalDuration, currentEventIndex]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const newPlayhead = traceStart + (pct / 100) * totalDuration;
    seek(newPlayhead, items);
  };

  return (
    <div
      className="relative h-8 w-full cursor-pointer bg-muted/50 rounded-md overflow-hidden"
      onClick={handleSeek}
    >
      {/* Progress bar */}
      <div
        className="absolute top-0 left-0 h-full bg-primary/20 transition-all duration-75"
        style={{ width: `${progressPct}%` }}
      />

      {/* Playhead indicator */}
      <div
        className="absolute top-0 h-full w-0.5 bg-primary z-10 transition-all duration-75"
        style={{ left: `${progressPct}%` }}
      />

      {/* Event markers */}
      {markers.map((marker) => (
        <div
          key={marker.id}
          className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full transition-colors ${
            marker.isActive ? "bg-primary" : "bg-muted-foreground/50"
          }`}
          style={{ left: `${marker.pct}%` }}
          title={`${marker.name} (${marker.category})`}
        />
      ))}
    </div>
  );
}