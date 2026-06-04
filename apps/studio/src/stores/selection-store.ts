"use client";

import { create } from "zustand";
import type { TimelineItem } from "@/lib/timeline";

interface SelectionState {
  selectedId: string | null;
  selectedItem: TimelineItem | null;
  select: (item: TimelineItem) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  selectedItem: null,
  select: (item) => set({ selectedId: item.id, selectedItem: item }),
  clear: () => set({ selectedId: null, selectedItem: null }),
}));
