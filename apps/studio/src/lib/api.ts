/**
 * Single API client for StepLens Studio.
 *
 * Calls the internal Next.js API routes (same origin, no CORS). This is the one
 * client list/detail/stats/annotations/saved-views/compare all share, built on
 * the contracts in `./trace-types`.
 */

import type {
  Annotation,
  AnnotationInput,
  CompareResult,
  SavedView,
  TraceDetail,
  TraceFilters,
  TraceListParams,
  TraceListResponse,
  TraceStats,
} from "./trace-types";

// Re-export the shared contracts so existing imports from "@/lib/api" keep working.
export type {
  Annotation,
  AnnotationInput,
  CompareCountDelta,
  CompareDeltas,
  CompareResult,
  CompareSpanDelta,
  CompareTraceMeta,
  CompareTraceSummary,
  EventRow,
  ModelCallRow,
  SavedView,
  SortOrder,
  SpanKind,
  SpanRow,
  SpanStatus,
  ToolCallRow,
  ToolCallStatus,
  TraceDetail,
  TraceFilters,
  TraceListItem,
  TraceListParams,
  TraceListResponse,
  TraceRow,
  TraceSortField,
  TraceStats,
  TraceStatus,
} from "./trace-types";

const API_BASE = "";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Serialize filters + paging into a query string for /api/traces and /stats. */
export function buildTraceQuery(params: TraceListParams): string {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.from != null) search.set("from", String(params.from));
  if (params.to != null) search.set("to", String(params.to));
  if (params.model) search.set("model", params.model);
  if (params.tool) search.set("tool", params.tool);
  if (params.hasError) search.set("hasError", "true");
  if (params.favorite) search.set("favorite", "true");
  if (params.tag) search.set("tag", params.tag);
  return search.toString();
}

// ── Traces ────────────────────────────────────────────────────────────────────

export async function listTraces(
  params: TraceListParams = {}
): Promise<TraceListResponse> {
  const qs = buildTraceQuery(params);
  return getJson<TraceListResponse>(`/api/traces?${qs}`);
}

export async function getTraceStats(
  filters: TraceFilters = {}
): Promise<TraceStats> {
  const qs = buildTraceQuery(filters);
  return getJson<TraceStats>(`/api/traces/stats?${qs}`);
}

export async function getTrace(id: string): Promise<TraceDetail> {
  return getJson<TraceDetail>(`/api/traces/${id}`);
}

export async function deleteTrace(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/traces/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function exportTrace(
  traceId: string,
  traceName = "trace"
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/export/${traceId}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${traceName.replace(/\s+/g, "_")}-${traceId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Annotations ─────────────────────────────────────────────────────────────

export async function getAnnotation(traceId: string): Promise<Annotation | null> {
  const res = await fetch(`${API_BASE}/api/traces/${traceId}/annotation`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return (json.annotation ?? null) as Annotation | null;
}

export async function updateAnnotation(
  traceId: string,
  input: AnnotationInput
): Promise<Annotation> {
  const res = await fetch(`${API_BASE}/api/traces/${traceId}/annotation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.annotation as Annotation;
}

// ── Saved views ───────────────────────────────────────────────────────────────

export async function listSavedViews(): Promise<SavedView[]> {
  const json = await getJson<{ views: SavedView[] }>(`/api/views`);
  return json.views ?? [];
}

export async function createSavedView(
  name: string,
  filters: TraceFilters
): Promise<SavedView> {
  const res = await fetch(`${API_BASE}/api/views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filters }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.view as SavedView;
}

export async function deleteSavedView(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/views/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

// ── Compare ───────────────────────────────────────────────────────────────────

export async function compareTraces(
  left: string,
  right: string
): Promise<CompareResult> {
  const search = new URLSearchParams({ left, right });
  return getJson<CompareResult>(`/api/compare?${search}`);
}

// ── Ingest (used by tests / programmatic clients) ───────────────────────────

export interface IngestEvent {
  kind: string;
  data: Record<string, unknown>;
}

export async function ingestEvents(
  events: IngestEvent[]
): Promise<{ accepted: string[]; errors: { index: number; message: string }[] }> {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Bulk operations ─────────────────────────────────────────────────────────

export interface BulkResult {
  ok: true;
  /** Rows affected, when known. */
  deleted?: number;
  written?: number;
  tag?: string;
  tagOp?: "add" | "remove";
}

export async function bulkDeleteTraces(ids: string[]): Promise<BulkResult> {
  const res = await fetch(`${API_BASE}/api/traces/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "delete", ids }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function bulkTagTraces(
  ids: string[],
  tagOp: "add" | "remove",
  tag: string
): Promise<BulkResult> {
  const res = await fetch(`${API_BASE}/api/traces/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "tag", ids, tagOp, tag }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Download a bulk export zip. Triggers a browser save dialog. */
export async function exportBulk(ids: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/export/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  a.download = `steplens-bulk-${ts}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Activity heat map ───────────────────────────────────────────────────────

export interface ActivityResponse {
  from: number;
  to: number;
  fromBucket: number;
  toBucket: number;
  tz: number;
  /** Maps "bucket" (days-since-epoch) → count. Sparse. */
  counts: Record<string, number>;
}

export async function getActivity(opts: {
  from?: number;
  to?: number;
  tzOffsetMinutes?: number;
} = {}): Promise<ActivityResponse> {
  const search = new URLSearchParams();
  if (opts.from != null) search.set("from", String(opts.from));
  if (opts.to != null) search.set("to", String(opts.to));
  if (opts.tzOffsetMinutes != null) search.set("tz", String(opts.tzOffsetMinutes));
  return getJson<ActivityResponse>(`/api/activity?${search.toString()}`);
}

// ── Live updates (Server-Sent Events) ───────────────────────────────────────

export interface SseTraceEvent {
  id: string;
  name: string;
  status: string;
  startedAt: number;
}

/** Open an SSE connection. Caller must `close()` when done. */
export function openTraceEventStream(
  handlers: {
    onTrace?: (t: SseTraceEvent) => void;
    onError?: (e: Event) => void;
    onClose?: () => void;
  } = {}
): EventSource {
  const es = new EventSource(`${API_BASE}/api/events/stream`);
  if (handlers.onTrace) {
    es.addEventListener("trace", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as SseTraceEvent;
        handlers.onTrace!(data);
      } catch {
        // ignore malformed
      }
    });
  }
  if (handlers.onError) es.addEventListener("error", handlers.onError);
  if (handlers.onClose) es.addEventListener("close", handlers.onClose);
  return es;
}
