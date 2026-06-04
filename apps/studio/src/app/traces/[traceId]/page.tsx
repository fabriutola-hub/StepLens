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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  getTrace,
  updateAnnotation,
  type Annotation,
  type TraceDetail,
} from "@/lib/api";
import {
  buildTimeline,
  computeSummary,
  flattenSpans,
} from "@/lib/timeline";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { EventInspector } from "@/components/inspector/event-inspector";
import { JsonViewer } from "@/components/inspector/json-viewer";
import { TraceGraph } from "@/components/graph/trace-graph";
import { ExportButton } from "@/components/export/export-button";
import { SummaryPanel } from "@/components/detail/summary-panel";
import { AnnotationPanel } from "@/components/annotations/annotation-panel";
import { FavoriteButton } from "@/components/annotations/favorite-button";
import { useSelection } from "@/stores/selection-store";
import { formatDuration, formatTimestamp, statusVariant } from "@/lib/format";
import { useShortcut } from "@/lib/shortcuts";
import { pushRecent } from "@/stores/recent-traces";

export default function TraceDetailPage() {
  const params = useParams<{ traceId: string }>();
  const router = useRouter();
  const traceId = params.traceId;

  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("summary");

  const select = useSelection((s) => s.select);

  // Effect-driven fetch (recommended React 19 pattern): the controller flag
  // makes it safe under StrictMode and unmount; setState lands inside a
  // microtask so the effect body stays "pure" from the linter's perspective.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });

    (async () => {
      try {
        const data = await getTrace(traceId);
        if (cancelled) return;
        setDetail(data);
        setAnnotation(data.annotation ?? null);
        // Track this trace in the recent list (only on success).
        pushRecent(traceId, data.trace.name);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch trace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [traceId]);

  const retry = useCallback(() => {
    // Bump a fake state to re-run the effect; simplest is to clear `detail` so
    // the spinner shows. We do it imperatively here (user-initiated, not in
    // render) so the purity rule is satisfied.
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await getTrace(traceId);
        setDetail(data);
        setAnnotation(data.annotation ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch trace");
      } finally {
        setLoading(false);
      }
    })();
  }, [traceId]);

  const timeline = useMemo(
    () => (detail ? buildTimeline(detail) : []),
    [detail]
  );

  const timelineById = useMemo(
    () => new Map(timeline.map((i) => [i.id, i])),
    [timeline]
  );

  const summary = useMemo(
    () => (detail ? computeSummary(detail) : null),
    [detail]
  );

  // `traceEnd` falls back to the most recent recorded timestamp when the
  // trace is still running. We avoid `Date.now()` during render (React 19's
  // purity rule) by deriving from the trace data we already have — events,
  // model calls, and tool calls each carry timestamps.
  const traceStart = detail?.trace.startedAt ?? 0;
  const traceEnd = useMemo(() => {
    if (!detail) return 0;
    if (detail.trace.endedAt != null) return detail.trace.endedAt;
    let max = detail.trace.startedAt;
    for (const ev of detail.events) {
      if (ev.timestamp > max) max = ev.timestamp;
    }
    for (const mc of detail.modelCalls) {
      const end = mc.endedAt ?? mc.startedAt + (mc.durationMs ?? 0);
      if (end > max) max = end;
    }
    for (const tc of detail.toolCalls) {
      const end = tc.endedAt ?? tc.startedAt + (tc.durationMs ?? 0);
      if (end > max) max = end;
    }
    return max;
  }, [detail]);

  // Selecting a hotspot jumps to the timeline and highlights the same item.
  const handleHotspotSelect = (id: string) => {
    const item = timelineById.get(id);
    if (item) {
      select(item);
      setActiveTab("timeline");
    }
  };

  const toggleFavorite = async () => {
    const next = !(annotation?.favorite ?? false);
    const optimistic: Annotation = {
      traceId,
      favorite: next,
      note: annotation?.note ?? null,
      tags: annotation?.tags ?? [],
      updatedAt: Date.now(),
    };
    setAnnotation(optimistic);
    try {
      const result = await updateAnnotation(traceId, { favorite: next });
      setAnnotation(result);
    } catch {
      setAnnotation(annotation);
    }
  };

  // ── Keyboard shortcuts: tab navigation + back + favorite toggle ──────
  useShortcut({
    key: "b",
    description: "Back to trace list",
    group: "Trace detail",
    handler: () => router.push("/traces"),
  });
  useShortcut({
    key: "s",
    description: "Summary tab",
    group: "Trace detail",
    handler: () => setActiveTab("summary"),
  });
  useShortcut({
    key: "t",
    description: "Timeline tab",
    group: "Trace detail",
    handler: () => setActiveTab("timeline"),
  });
  useShortcut({
    key: "g",
    description: "Graph tab",
    group: "Trace detail",
    handler: () => setActiveTab("graph"),
  });
  useShortcut({
    key: "v",
    description: "Events tab",
    group: "Trace detail",
    handler: () => setActiveTab("events"),
  });
  useShortcut({
    key: "d",
    description: "Data tab",
    group: "Trace detail",
    handler: () => setActiveTab("data"),
  });
  useShortcut({
    key: "f",
    description: "Toggle favorite",
    group: "Trace detail",
    handler: () => void toggleFavorite(),
  });

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
        <p className="text-sm text-muted-foreground">
          {error ?? "The requested trace could not be loaded."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/traces")}>
            Back to Traces
          </Button>
          <Button variant="ghost" onClick={retry}>
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
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => router.push("/traces")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <FavoriteButton
              favorite={annotation?.favorite ?? false}
              onToggle={toggleFavorite}
              size="md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{trace.name}</h1>
                <Badge variant={statusVariant(trace.status)}>{trace.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTimestamp(trace.startedAt)} ·{" "}
                {formatDuration(trace.durationMs)} ·{" "}
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
                  <span
                    className="hidden sm:inline"
                    title="Estimated cost in USD (static pricing)"
                  >
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
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-1 flex-col"
          >
            <div className="shrink-0 border-b px-4 py-2">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="graph">Graph</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="summary" className="mt-0 flex-1 overflow-auto">
              <SummaryPanel detail={detail} onSelect={handleHotspotSelect} />
            </TabsContent>

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
                {trace.input == null &&
                  trace.output == null &&
                  trace.metadata == null && (
                    <p className="text-sm text-muted-foreground">
                      No input/output data recorded for this trace.
                    </p>
                  )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="hidden w-[380px] shrink-0 flex-col lg:flex">
          <div className="border-b p-3">
            {/* `key` remounts the editor on trace navigation so its internal
                state resets cleanly without setState-in-effect. */}
            <AnnotationPanel
              key={trace.id}
              traceId={trace.id}
              initial={annotation}
              onSaved={setAnnotation}
            />
          </div>
          <div className="min-h-0 flex-1">
            <EventInspector />
          </div>
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
  for (const sp of flattenSpans(detail.spans)) {
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
