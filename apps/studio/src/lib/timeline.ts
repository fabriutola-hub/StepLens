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
export function buildTimeline(detail: TraceDetail): TimelineItem[] {
  const { trace, events, spans, modelCalls, toolCalls } = detail;

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
