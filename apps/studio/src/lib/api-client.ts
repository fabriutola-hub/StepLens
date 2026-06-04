/**
 * API client for StepLens internal Next.js API routes.
 * Calls /api/traces, /api/traces/[id], /api/export/[id], /api/events.
 */

export interface TraceListItem {
  id: string;
  name: string;
  status: "running" | "success" | "error" | "cancelled";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  estimatedCostUsd: number;
}

export interface TraceListResponse {
  traces: TraceListItem[];
  total: number;
}

export interface TraceDetailResponse {
  trace: {
    id: string;
    name: string;
    status: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number | null;
    input: unknown;
    output: unknown;
    metadata: Record<string, unknown> | null;
  };
  events: {
    id: string;
    traceId: string;
    parentId: string | null;
    type: string;
    name: string;
    timestamp: number;
    durationMs: number | null;
    input: unknown;
    output: unknown;
    error: unknown;
    metadata: Record<string, unknown> | null;
  }[];
  spans: {
    id: string;
    traceId: string;
    parentId: string | null;
    name: string;
    kind: string;
    status: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number | null;
    attributes: Record<string, unknown> | null;
    children: any[];
  }[];
  modelCalls: {
    id: string;
    traceId: string;
    spanId: string | null;
    provider: string;
    model: string;
    prompt: string | null;
    messages: unknown;
    response: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedCostUsd: number | null;
    startedAt: number;
    endedAt: number | null;
    durationMs: number | null;
    metadata: Record<string, unknown> | null;
  }[];
  toolCalls: {
    id: string;
    traceId: string;
    spanId: string | null;
    toolName: string;
    input: unknown;
    output: unknown;
    status: string;
    startedAt: number;
    endedAt: number | null;
    durationMs: number | null;
    error: unknown;
    metadata: Record<string, unknown> | null;
  }[];
}

export async function fetchTraces(
  limit = 20,
  offset = 0,
  status?: string
): Promise<TraceListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (status) params.set("status", status);

  const res = await fetch(`/api/traces?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchTraceDetail(
  traceId: string
): Promise<TraceDetailResponse> {
  const res = await fetch(`/api/traces/${traceId}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function exportTrace(traceId: string): Promise<void> {
  const res = await fetch(`/api/export/${traceId}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace-${traceId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface IngestEvent {
  kind: string;
  data: Record<string, unknown>;
}

export async function ingestEvents(
  events: IngestEvent[]
): Promise<{ accepted: string[]; errors: { index: number; message: string }[] }> {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
