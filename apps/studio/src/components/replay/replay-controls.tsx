"use client";

import { useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReplay, type ReplaySpeed } from "@/stores/replay-store";
import type { TimelineItem } from "@/lib/timeline";

interface ReplayControlsProps {
  items: TimelineItem[];
  traceStart: number;
  traceEnd: number;
}

export function ReplayControls({ items, traceStart, traceEnd }: ReplayControlsProps) {
  const { playing, speed, currentEventIndex, setPlaying, setSpeed, updatePlayhead, stepForward, stepBackward, reset } = useReplay();
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Auto-pause on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && playing) {
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [playing, setPlaying]);

  // Replay engine using requestAnimationFrame. We read `items` indirectly
  // through `itemsRef.current` so a fresh `items` array doesn't restart the
  // animation loop — but it means the deps must reflect that the effect does
  // not actually depend on the items array itself.
  useEffect(() => {
    if (!playing || itemsRef.current.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      const state = useReplay.getState();
      const newPlayhead = state.playhead + deltaTime * state.speed;

      updatePlayhead(newPlayhead, itemsRef.current);

      if (newPlayhead >= traceEnd) {
        setPlaying(false);
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playing, traceEnd, setPlaying, updatePlayhead]);

  const handlePlayPause = () => {
    if (playing) {
      setPlaying(false);
      lastTimeRef.current = null;
    } else {
      const state = useReplay.getState();
      if (state.playhead >= traceEnd || state.playhead < traceStart) {
        reset(traceStart);
      }
      setPlaying(true);
    }
  };

  const handleStepForward = () => {
    stepForward(items);
    lastTimeRef.current = null;
  };

  const handleStepBackward = () => {
    stepBackward(items);
    lastTimeRef.current = null;
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={handleStepBackward} disabled={currentEventIndex === 0}>
        <SkipBack className="size-4" />
      </Button>

      <Button variant="ghost" size="icon" onClick={handlePlayPause}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>

      <Button variant="ghost" size="icon" onClick={handleStepForward} disabled={currentEventIndex >= items.length - 1}>
        <SkipForward className="size-4" />
      </Button>

      <div className="ml-4 flex-1" />

      <Select value={speed.toString()} onValueChange={(v) => setSpeed(Number(v) as ReplaySpeed)}>
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.5">0.5x</SelectItem>
          <SelectItem value="1">1x</SelectItem>
          <SelectItem value="2">2x</SelectItem>
          <SelectItem value="5">5x</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}