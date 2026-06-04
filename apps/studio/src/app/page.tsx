"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TraceList } from "@/components/trace-list";
import { useTraceStore } from "@/stores/trace-store";

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "success", label: "Completed" },
  { value: "error", label: "Failed" },
] as const;

export default function Home() {
  const statusFilter = useTraceStore((s) => s.statusFilter);
  const setStatusFilter = useTraceStore((s) => s.setStatusFilter);
  const startPolling = useTraceStore((s) => s.startPolling);

  useEffect(() => {
    const stop = startPolling();
    return stop;
  }, [startPolling]);

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Traces</h1>
            <Badge variant="outline" className="gap-1">
              <Activity className="size-3" />
              Live
            </Badge>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mb-6">
          <Tabs
            value={statusFilter}
            onValueChange={setStatusFilter}
            aria-label="Filter traces by status"
          >
            <TabsList variant="line">
              {FILTER_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Trace list */}
        <TraceList />
      </div>
    </main>
  );
}
