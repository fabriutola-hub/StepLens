"use client";

import { create } from "zustand";
import type { TraceListItem } from "@/lib/api-client";
import { fetchTraces } from "@/lib/api-client";

interface TraceStore {
  traces: TraceListItem[];
  total: number;
  loading: boolean;
  statusFilter: string;
  page: number;
  pageSize: number;

  loadTraces: () => Promise<void>;
  setStatusFilter: (status: string) => void;
  setPage: (page: number) => void;
  startPolling: () => () => void;
}

export const useTraceStore = create<TraceStore>((set, get) => ({
  traces: [],
  total: 0,
  loading: false,
  statusFilter: "all",
  page: 0,
  pageSize: 20,

  loadTraces: async () => {
    const { statusFilter, page, pageSize } = get();
    set({ loading: true });
    try {
      const status = statusFilter === "all" ? undefined : statusFilter;
      const result = await fetchTraces(pageSize, page * pageSize, status);
      set({ traces: result.traces, total: result.total, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setStatusFilter: (status: string) => {
    set({ statusFilter: status, page: 0 });
    get().loadTraces();
  },

  setPage: (page: number) => {
    set({ page });
    get().loadTraces();
  },

  startPolling: () => {
    get().loadTraces();
    const interval = setInterval(() => {
      get().loadTraces();
    }, 3000);
    return () => clearInterval(interval);
  },
}));
