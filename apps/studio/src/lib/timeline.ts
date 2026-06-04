/**
 * Timeline types and transform logic.
 *
 * Converts raw trace data (events, spans, model calls, tool calls) into
 * unified timeline items with position and color information for rendering.
 */

import type {
  TraceDetail,
  EventRow,
  SpanRow,
  ModelCallRow,
  ToolCallRow,
} from "@/lib/api";

// ── Timeline Item Types ─────────────────────────────────────────────────────

export type TimelineCategory = "event" | "span" | "model_call" | "tool_call";

export interface TimelineItem {
  /** Unique ID from the original row */
  id: string;
  /** Which source table this came from */
  category: TimelineCategory;
  /** Display name */
  name: string;
  /** Sub-label (e.g. event type, span kind, model name, tool name) */
  subLabel: string;
  /** Start time (epoch ms) */
  startTime: number;
  /** Duration in ms (null for point-in-time events) */
  durationMs: number | null;
  /** Status if applicable */
  status: string | null;
  /** CSS color class for the bar */
  color: string;
  /** Left position as % of timeline width */
  leftPct: number;
  /** Width as % of timeline width (min 2% for visibility) */
  widthPct: number;
  /** The original data row for the inspector */
  raw: EventRow | SpanRow | ModelCallRow | ToolCallRow;
}

// ── Color Map ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<TimelineCategory, string> = {
  event: "bg-blue-500",
  span: "bg-indigo-500",
  model_call: "bg-purple-500",
  tool_call: "bg-emerald-500",
};

const ERROR_COLOR = "bg-red-500";

function getCategoryColor(
  category: TimelineCategory,
  status: string | null,
  type?: string
): string {
  if (status === "error" || type === "error") return ERROR_COLOR;
  return CATEGORY_COLORS[category];
}

// ── Transform ───────────────────────────────────────────────────────────────

/**
 * Convert all trace data into a sorted array of timeline items with
 * percentage-based positions for CSS rendering.
 */
/** Flatten a (possibly nested) span tree into a single list. */
export function flattenSpans(spans: SpanRow[]): SpanRow[] {
  const out: SpanRow[] = [];
  const walk = (list: SpanRow[] | undefined) => {
    for (const span of list ?? []) {
      out.push(span);
      if (span.children && span.children.length) walk(span.children);
    }
  };
  walk(spans);
  return out;
}

export function buildTimeline(detail: TraceDetail): TimelineItem[] {
  const { trace, events, modelCalls, toolCalls } = detail;
  const spans = flattenSpans(detail.spans);

  // Determine the time range of the entire trace
  const traceStart = trace.startedAt;
  const traceEnd = trace.endedAt ?? Date.now();
  const totalDuration = Math.max(traceEnd - traceStart, 1); // avoid div by zero

  const items: TimelineItem[] = [];

  // ── Events ──────────────────────────────────────────────────────────
  for (const ev of events) {
    const offset = ev.timestamp - traceStart;
    const dur = ev.durationMs ?? 0;
    const leftPct = (offset / totalDuration) * 100;
    const widthPct = Math.max((dur / totalDuration) * 100, dur > 0 ? 2 : 0.8);

    items.push({
      id: ev.id,
      category: "event",
      name: ev.name,
      subLabel: ev.type,
      startTime: ev.timestamp,
      durationMs: ev.durationMs,
      status: ev.error ? "error" : null,
      color: getCategoryColor("event", ev.error ? "error" : null, ev.type),
      leftPct: clamp(leftPct, 0, 100),
      widthPct: clamp(widthPct, 0, 100 - leftPct),
      raw: ev,
    });
  }

  // ── Spans ───────────────────────────────────────────────────────────
  for (const sp of spans) {
    const offset = sp.startedAt - traceStart;
    const dur = sp.durationMs ?? 0;
    const leftPct = (offset / totalDuration) * 100;
    const widthPct = Math.max((dur / totalDuration) * 100, 2);

    items.push({
      id: sp.id,
      category: "span",
      name: sp.name,
      subLabel: sp.kind,
      startTime: sp.startedAt,
      durationMs: sp.durationMs,
      status: sp.status,
      color: getCategoryColor("span", sp.status),
      leftPct: clamp(leftPct, 0, 100),
      widthPct: clamp(widthPct, 0, 100 - leftPct),
      raw: sp,
    });
  }

  // ── Model Calls ─────────────────────────────────────────────────────
  for (const mc of modelCalls) {
    const offset = mc.startedAt - traceStart;
    const dur = mc.durationMs ?? 0;
    const leftPct = (offset / totalDuration) * 100;
    const widthPct = Math.max((dur / totalDuration) * 100, 2);

    items.push({
      id: mc.id,
      category: "model_call",
      name: `${mc.provider}/${mc.model}`,
      subLabel: mc.model,
      startTime: mc.startedAt,
      durationMs: mc.durationMs,
      status: null,
      color: getCategoryColor("model_call", null),
      leftPct: clamp(leftPct, 0, 100),
      widthPct: clamp(widthPct, 0, 100 - leftPct),
      raw: mc,
    });
  }

  // ── Tool Calls ──────────────────────────────────────────────────────
  for (const tc of toolCalls) {
    const offset = tc.startedAt - traceStart;
    const dur = tc.durationMs ?? 0;
    const leftPct = (offset / totalDuration) * 100;
    const widthPct = Math.max((dur / totalDuration) * 100, 2);

    items.push({
      id: tc.id,
      category: "tool_call",
      name: tc.toolName,
      subLabel: tc.status,
      startTime: tc.startedAt,
      durationMs: tc.durationMs,
      status: tc.status,
      color: getCategoryColor("tool_call", tc.status),
      leftPct: clamp(leftPct, 0, 100),
      widthPct: clamp(widthPct, 0, 100 - leftPct),
      raw: tc,
    });
  }

  // Sort by start time
  items.sort((a, b) => a.startTime - b.startTime);
  return items;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ── Summary Stats ───────────────────────────────────────────────────────────

export interface TraceSummary {
  eventCount: number;
  spanCount: number;
  modelCallCount: number;
  toolCallCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/**
 * Format an estimated cost (in decimal USD — never cents) for display.
 * Returns "—" for null/zero so empty cells read cleanly.
 */
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null || usd === 0) return "—";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function computeSummary(detail: TraceDetail): TraceSummary {
  const totalTokens = detail.modelCalls.reduce(
    (sum, mc) => sum + (mc.totalTokens ?? 0),
    0
  );
  const estimatedCostUsd = detail.modelCalls.reduce(
    (sum, mc) => sum + (mc.estimatedCostUsd ?? 0),
    0
  );

  return {
    eventCount: detail.events.length,
    spanCount: detail.spans.length,
    modelCallCount: detail.modelCalls.length,
    toolCallCount: detail.toolCalls.length,
    totalTokens,
    estimatedCostUsd,
  };
}

// ── Hotspots ──────────────────────────────────────────────────────────────────

export interface Hotspot {
  /** Matches the id of the corresponding timeline item, for cross-selection. */
  id: string;
  category: TimelineCategory;
  label: string;
  subLabel: string;
  durationMs: number | null;
  status: string | null;
  /** Optional extra context (tokens, cost, error message). */
  detail?: string;
}

export interface TraceHotspots {
  slowestSpans: Hotspot[];
  slowestModelCalls: Hotspot[];
  slowestTools: Hotspot[];
  errors: Hotspot[];
  /** Cross-category "needs attention" list: errors, most expensive, slowest. */
  critical: Hotspot[];
  totalTokens: number;
  estimatedCostUsd: number;
}

const HOTSPOT_LIMIT = 5;

function byDurationDesc<T extends { durationMs: number | null }>(a: T, b: T) {
  return (b.durationMs ?? 0) - (a.durationMs ?? 0);
}

/**
 * Compute hotspots for the summary panel: slowest spans / model calls / tools,
 * errors, and a cross-category "critical" shortlist. Each hotspot carries the
 * id of its timeline item so a click can select the same item elsewhere.
 */
export function computeHotspots(detail: TraceDetail): TraceHotspots {
  const spans = flattenSpans(detail.spans);

  const slowestSpans: Hotspot[] = [...spans]
    .filter((s) => (s.durationMs ?? 0) > 0)
    .sort(byDurationDesc)
    .slice(0, HOTSPOT_LIMIT)
    .map((s) => ({
      id: s.id,
      category: "span" as const,
      label: s.name,
      subLabel: s.kind,
      durationMs: s.durationMs,
      status: s.status,
    }));

  const slowestModelCalls: Hotspot[] = [...detail.modelCalls]
    .sort(byDurationDesc)
    .slice(0, HOTSPOT_LIMIT)
    .map((m) => ({
      id: m.id,
      category: "model_call" as const,
      label: `${m.provider}/${m.model}`,
      subLabel: m.model,
      durationMs: m.durationMs,
      status: null,
      detail: [
        m.totalTokens != null ? `${m.totalTokens.toLocaleString()} tok` : null,
        m.estimatedCostUsd ? formatCostUsd(m.estimatedCostUsd) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  const slowestTools: Hotspot[] = [...detail.toolCalls]
    .sort(byDurationDesc)
    .slice(0, HOTSPOT_LIMIT)
    .map((t) => ({
      id: t.id,
      category: "tool_call" as const,
      label: t.toolName,
      subLabel: t.status,
      durationMs: t.durationMs,
      status: t.status,
    }));

  const errors: Hotspot[] = [];
  for (const ev of detail.events) {
    if (ev.type === "error" || ev.error != null) {
      errors.push({
        id: ev.id,
        category: "event",
        label: ev.name,
        subLabel: ev.type,
        durationMs: ev.durationMs,
        status: "error",
        detail: errorMessage(ev.error),
      });
    }
  }
  for (const t of detail.toolCalls) {
    if (t.status === "error") {
      errors.push({
        id: t.id,
        category: "tool_call",
        label: t.toolName,
        subLabel: "tool",
        durationMs: t.durationMs,
        status: "error",
        detail: errorMessage(t.error),
      });
    }
  }
  for (const s of spans) {
    if (s.status === "error") {
      errors.push({
        id: s.id,
        category: "span",
        label: s.name,
        subLabel: s.kind,
        durationMs: s.durationMs,
        status: "error",
      });
    }
  }

  // Critical shortlist: errors first, then most expensive model call, then the
  // slowest item overall — de-duplicated by id.
  const critical: Hotspot[] = [];
  const seen = new Set<string>();
  const push = (h: Hotspot | undefined) => {
    if (h && !seen.has(h.id)) {
      seen.add(h.id);
      critical.push(h);
    }
  };
  errors.slice(0, 3).forEach(push);
  const mostExpensive = [...detail.modelCalls]
    .filter((m) => (m.estimatedCostUsd ?? 0) > 0)
    .sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0))[0];
  if (mostExpensive) {
    push({
      id: mostExpensive.id,
      category: "model_call",
      label: `${mostExpensive.provider}/${mostExpensive.model}`,
      subLabel: "most expensive",
      durationMs: mostExpensive.durationMs,
      status: null,
      detail: formatCostUsd(mostExpensive.estimatedCostUsd),
    });
  }
  const slowestOverall = [
    ...slowestSpans,
    ...slowestModelCalls,
    ...slowestTools,
  ].sort(byDurationDesc)[0];
  push(slowestOverall);

  const { totalTokens, estimatedCostUsd } = computeSummary(detail);

  return {
    slowestSpans,
    slowestModelCalls,
    slowestTools,
    errors,
    critical: critical.slice(0, HOTSPOT_LIMIT),
    totalTokens,
    estimatedCostUsd,
  };
}

function errorMessage(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { message?: unknown; name?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.name === "string") return e.name;
  }
  return undefined;
}
