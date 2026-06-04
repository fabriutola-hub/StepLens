/**
 * Shared transport-level type contracts for the Studio API.
 *
 * Pure types only — no runtime imports — so the server (queries + route
 * handlers) and the browser (the single API client + components) depend on one
 * source of truth for request/response shapes. This is what lets list, detail,
 * stats, annotations, saved views, and compare share the same contracts.
 */

// ── Enums (mirror @agent-replay/core, kept local to avoid a runtime import) ───

export type TraceStatus = "running" | "success" | "error" | "cancelled";
export type SpanKind =
  | "agent"
  | "model"
  | "tool"
  | "retrieval"
  | "parser"
  | "custom";
export type SpanStatus = "running" | "success" | "error";
export type ToolCallStatus = "running" | "success" | "error";

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface TraceRow {
  id: string;
  name: string;
  status: TraceStatus;
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
  kind: SpanKind;
  status: SpanStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  attributes: Record<string, unknown> | null;
  children?: SpanRow[];
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
  status: ToolCallStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  error: unknown;
  metadata: Record<string, unknown> | null;
}

// ── Annotations (local Studio metadata) ───────────────────────────────────────

export interface Annotation {
  traceId: string;
  favorite: boolean;
  note: string | null;
  tags: string[];
  updatedAt: number;
}

/** Partial update payload. `undefined` fields are left unchanged. */
export interface AnnotationInput {
  favorite?: boolean;
  note?: string | null;
  tags?: string[];
}

// ── Detail ────────────────────────────────────────────────────────────────────

export interface TraceDetail {
  trace: TraceRow;
  events: EventRow[];
  spans: SpanRow[];
  modelCalls: ModelCallRow[];
  toolCalls: ToolCallRow[];
  /** Local annotation, if any has been saved for this trace. */
  annotation?: Annotation | null;
}

// ── List + filters ─────────────────────────────────────────────────────────────

export interface TraceListItem {
  id: string;
  name: string;
  status: TraceStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  estimatedCostUsd: number;
  favorite: boolean;
  note: string | null;
  tags: string[];
}

export interface TraceListResponse {
  traces: TraceListItem[];
  total: number;
}

export type TraceSortField = "startedAt" | "durationMs" | "name" | "status";
export type SortOrder = "asc" | "desc";

/** Advanced trace filters shared by /api/traces and /api/traces/stats. */
export interface TraceFilters {
  /** Free-text match against trace name or id. */
  q?: string;
  status?: string;
  /** startedAt >= from (epoch ms). */
  from?: number;
  /** startedAt <= to (epoch ms). */
  to?: number;
  /** Only traces with a model call using this model. */
  model?: string;
  /** Only traces with a tool call using this tool name. */
  tool?: string;
  /** Only traces that errored (status, error event, or failed span/tool). */
  hasError?: boolean;
  /** Only favorited traces. */
  favorite?: boolean;
  /** Only traces tagged with this tag. */
  tag?: string;
}

export interface TraceListParams extends TraceFilters {
  limit?: number;
  offset?: number;
  sort?: TraceSortField;
  order?: SortOrder;
}

// ── Stats ───────────────────────────────────────────────────────────────────

export interface TraceStats {
  total: number;
  statusCounts: Record<string, number>;
  totalDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalTokens: number;
  estimatedCostUsd: number;
  modelCounts: Record<string, number>;
  toolCounts: Record<string, number>;
  errorCount: number;
  /** errorCount / total, in [0, 1]. */
  errorRate: number;
}

// ── Saved views ───────────────────────────────────────────────────────────────

export interface SavedView {
  id: string;
  name: string;
  filters: TraceFilters;
  createdAt: number;
  updatedAt: number;
}

// ── Compare ───────────────────────────────────────────────────────────────────

export interface CompareTraceMeta {
  id: string;
  name: string;
  status: TraceStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  favorite: boolean;
  tags: string[];
}

export interface CompareTraceSummary {
  trace: CompareTraceMeta;
  durationMs: number;
  estimatedCostUsd: number;
  totalTokens: number;
  modelCallCount: number;
  toolCallCount: number;
  spanCount: number;
  eventCount: number;
  errorCount: number;
  models: Record<string, number>;
  tools: Record<string, number>;
}

export interface CompareCountDelta {
  key: string;
  left: number;
  right: number;
  delta: number;
}

export interface CompareSpanDelta {
  key: string;
  kind: string;
  name: string;
  leftDurationMs: number | null;
  rightDurationMs: number | null;
  deltaMs: number | null;
}

export interface CompareDeltas {
  durationMs: number;
  estimatedCostUsd: number;
  totalTokens: number;
  errorCount: number;
  models: CompareCountDelta[];
  tools: CompareCountDelta[];
  spans: CompareSpanDelta[];
}

export interface CompareResult {
  left: CompareTraceSummary;
  right: CompareTraceSummary;
  deltas: CompareDeltas;
}
