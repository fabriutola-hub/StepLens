"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Zap,
  Cpu,
  Wrench,
  AlertCircle,
  List,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getTrace, type TraceDetail } from "@/lib/api";
import { buildTimeline, computeSummary, type TimelineItem } from "@/lib/timeline";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { EventInspector } from "@/components/inspector/event-inspector";
import { JsonViewer } from "@/components/inspector/json-viewer";
import { TraceGraph } from "@/components/graph/trace-graph";
import { ExportButton } from "@/components/export/export-button";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

export default function TraceDetailPage() {
  const params = useParams<{ traceId: string }>();
  const router = useRouter();
  const traceId = params.traceId;

  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTrace(traceId);
      setDetail(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch trace"
      );
    } finally {
      setLoading(false);
    }
  }, [traceId]);

  useEffect(() => {
    fetchTrace();
  }, [fetchTrace]);

  const timeline = useMemo(
    () => (detail ? buildTimeline(detail) : []),
    [detail]
  );

  const summary = useMemo(
    () => (detail ? computeSummary(detail) : null),
    [detail]
  );

  const traceStart = detail?.trace.startedAt ?? 0;
  const traceEnd = detail?.trace.endedAt ?? Date.now();

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b px-6 py-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="flex flex-1">
          <div className="flex-1 border-r p-6">
            <div className="space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </div>
          <div className="w-96 p-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-4 h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="size-12 text-destructive/50" />
        <h2 className="text-lg font-medium">Trace not found</h2>
        <p className="text-sm text-muted-foreground">{error ?? "The requested trace could not be loaded."}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/traces")}>
            Back to Traces
          </Button>
          <Button variant="ghost" onClick={fetchTrace}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { trace } = detail;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon-sm" onClick={() => router.push("/traces")}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{trace.name}</h1>
                <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTimestamp(trace.startedAt)} · {formatDuration(trace.durationMs)} ·{" "}
                <span className="font-mono">{trace.id.slice(0, 8)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {summary && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <StatChip icon={List} label="Events" value={summary.eventCount} />
                <StatChip icon={Zap} label="Spans" value={summary.spanCount} />
                <StatChip icon={Cpu} label="Models" value={summary.modelCallCount} />
                <StatChip icon={Wrench} label="Tools" value={summary.toolCallCount} />
                {summary.totalTokens > 0 && (
                  <span className="hidden sm:inline">
                    {summary.totalTokens.toLocaleString()} tokens
                  </span>
                )}
                {summary.estimatedCostUsd > 0 && (
                  <span className="hidden sm:inline" title="Estimated cost in USD (static pricing)">
                    est. ${summary.estimatedCostUsd.toFixed(4)}
                  </span>
                )}
              </div>
            )}
            <ExportButton traceId={trace.id} traceName={trace.name} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r">
          <Tabs defaultValue="timeline" className="flex flex-1 flex-col">
            <div className="shrink-0 border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="graph">Graph</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="timeline" className="mt-0 flex-1 overflow-auto">
              <TimelinePanel
                items={timeline}
                traceStart={traceStart}
                traceEnd={traceEnd}
              />
            </TabsContent>

            <TabsContent value="graph" className="mt-0 flex-1">
              <TraceGraph detail={detail} />
            </TabsContent>

            <TabsContent value="events" className="mt-0 flex-1 overflow-auto">
              <EventsTable detail={detail} />
            </TabsContent>

            <TabsContent value="data" className="mt-0 flex-1 overflow-auto p-4">
              <div className="space-y-4">
                {trace.input != null && (
                  <Card>
                    <CardContent className="py-3">
                      <JsonViewer data={trace.input} label="Input" defaultOpen />
                    </CardContent>
                  </Card>
                )}
                {trace.output != null && (
                  <Card>
                    <CardContent className="py-3">
                      <JsonViewer data={trace.output} label="Output" defaultOpen />
                    </CardContent>
                  </Card>
                )}
                {trace.metadata != null && (
                  <Card>
                    <CardContent className="py-3">
                      <JsonViewer data={trace.metadata} label="Metadata" />
                    </CardContent>
                  </Card>
                )}
                {trace.input == null && trace.output == null && trace.metadata == null && (
                  <p className="text-sm text-muted-foreground">
                    No input/output data recorded for this trace.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="hidden w-[380px] shrink-0 lg:block">
          <EventInspector />
        </div>
      </div>
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon className="size-3" />
      <span className="font-medium">{value}</span>
    </span>
  );
}

function EventsTable({ detail }: { detail: TraceDetail }) {
  const allItems: Array<{
    time: number;
    type: string;
    name: string;
    status: string | null;
    duration: string;
    category: string;
  }> = [];

  for (const ev of detail.events) {
    allItems.push({
      time: ev.timestamp,
      type: ev.type,
      name: ev.name,
      status: ev.error ? "error" : null,
      duration: ev.durationMs != null ? formatDuration(ev.durationMs) : "—",
      category: "event",
    });
  }
  for (const sp of detail.spans) {
    allItems.push({
      time: sp.startedAt,
      type: sp.kind,
      name: sp.name,
      status: sp.status,
      duration: formatDuration(sp.durationMs),
      category: "span",
    });
  }
  for (const mc of detail.modelCalls) {
    allItems.push({
      time: mc.startedAt,
      type: `model:${mc.model}`,
      name: `${mc.provider}/${mc.model}`,
      status: null,
      duration: formatDuration(mc.durationMs),
      category: "model_call",
    });
  }
  for (const tc of detail.toolCalls) {
    allItems.push({
      time: tc.startedAt,
      type: `tool:${tc.toolName}`,
      name: tc.toolName,
      status: tc.status,
      duration: formatDuration(tc.durationMs),
      category: "tool_call",
    });
  }

  allItems.sort((a, b) => a.time - b.time);

  const categoryColors: Record<string, string> = {
    event: "bg-blue-500",
    span: "bg-indigo-500",
    model_call: "bg-purple-500",
    tool_call: "bg-emerald-500",
  };

  if (allItems.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No events recorded.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {allItems.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/30"
        >
          <div
            className={`size-2 shrink-0 rounded-full ${
              item.status === "error"
                ? "bg-red-500"
                : categoryColors[item.category] ?? "bg-gray-400"
            }`}
          />
          <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
            {new Date(item.time).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
            {item.type}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
          <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
            {item.duration}
          </span>
        </div>
      ))}
    </div>
  );
}
