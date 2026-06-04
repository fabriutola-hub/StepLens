"use client";

import { create } from "zustand";

export type ReplaySpeed = 0.5 | 1 | 2 | 5;

interface ReplayState {
  playing: boolean;
  speed: ReplaySpeed;
  currentEventIndex: number;
  playhead: number;

  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setCurrentEventIndex: (index: number) => void;
  setPlayhead: (playhead: number) => void;
  updatePlayhead: (playhead: number, items: { startTime: number }[]) => void;
  seek: (playhead: number, items: { startTime: number }[]) => void;
  stepForward: (items: { startTime: number }[]) => void;
  stepBackward: (items: { startTime: number }[]) => void;
  reset: (traceStart: number) => void;
}

export const useReplay = create<ReplayState>((set, get) => ({
  playing: false,
  speed: 1,
  currentEventIndex: 0,
  playhead: 0,

  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setCurrentEventIndex: (currentEventIndex) => set({ currentEventIndex }),
  setPlayhead: (playhead) => set({ playhead }),

  updatePlayhead: (playhead, items) => {
    let newIndex = get().currentEventIndex;
    while (newIndex < items.length - 1 && items[newIndex + 1].startTime <= playhead) {
      newIndex++;
    }
    while (newIndex > 0 && items[newIndex].startTime > playhead) {
      newIndex--;
    }
    set({ playhead, currentEventIndex: newIndex });
  },

  seek: (playhead, items) => {
    let newIndex = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].startTime <= playhead) {
        newIndex = i;
      } else {
        break;
      }
    }
    set({ playhead, currentEventIndex: newIndex, playing: false });
  },

  stepForward: (items) => {
    const { currentEventIndex } = get();
    if (currentEventIndex < items.length - 1) {
      const nextIndex = currentEventIndex + 1;
      set({
        currentEventIndex: nextIndex,
        playhead: items[nextIndex].startTime,
        playing: false
      });
    }
  },

  stepBackward: (items) => {
    const { currentEventIndex } = get();
    if (currentEventIndex > 0) {
      const prevIndex = currentEventIndex - 1;
      set({
        currentEventIndex: prevIndex,
        playhead: items[prevIndex].startTime,
        playing: false
      });
    } else {
      set({ currentEventIndex: 0, playhead: items[0]?.startTime ?? 0, playing: false });
    }
  },

  reset: (traceStart) => set({ playing: false, currentEventIndex: 0, playhead: traceStart }),
}));