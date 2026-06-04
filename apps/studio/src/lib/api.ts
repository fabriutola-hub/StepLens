/**
 * API client for StepLens.
 * Calls internal Next.js API routes (same origin, no CORS needed).
 */

const API_BASE = "";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TraceRow {
  id: string;
  name: string;
  status: "running" | "success" | "error" | "cancelled";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  estimatedCostUsd?: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface EventRow {
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
}

export interface SpanRow {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: "agent" | "model" | "tool" | "retrieval" | "parser" | "custom";
  status: "running" | "success" | "error";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  attributes: Record<string, unknown> | null;
  children?: any[];
}

export interface ModelCallRow {
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
}

export interface ToolCallRow {
  id: string;
  traceId: string;
  spanId: string | null;
  toolName: string;
  input: unknown;
  output: unknown;
  status: "running" | "success" | "error";
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  error: unknown;
  metadata: Record<string, unknown> | null;
}

export interface TraceDetail {
  trace: TraceRow;
  events: EventRow[];
  spans: SpanRow[];
  modelCalls: ModelCallRow[];
  toolCalls: ToolCallRow[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

// ── API Functions ───────────────────────────────────────────────────────────

export interface ListTracesParams {
  limit?: number;
  offset?: number;
  status?: string;
  name?: string;
}

export async function listTraces(
  params: ListTracesParams = {}
): Promise<PaginatedResponse<TraceRow>> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.status) search.set("status", params.status);
  if (params.name) search.set("name", params.name);

  const res = await fetch(`${API_BASE}/api/traces?${search}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  // Normalize the response shape: API returns { traces, total }
  return { data: json.traces ?? [], total: json.total ?? 0 };
}

export async function getTrace(id: string): Promise<TraceDetail> {
  const res = await fetch(`${API_BASE}/api/traces/${id}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  // API returns { trace, events, spans, modelCalls, toolCalls }
  return res.json();
}

export async function deleteTrace(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/traces/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}
