import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatDeltaMs,
  statusVariant,
  formatRelativeTime,
} from "../src/lib/format";
import { buildTraceQuery } from "../src/lib/api";
import { parseTraceParams } from "../src/lib/parse-filters";
import { computeHotspots, flattenSpans } from "../src/lib/timeline";
import type {
  EventRow,
  ModelCallRow,
  SpanRow,
  ToolCallRow,
  TraceDetail,
} from "../src/lib/api";

// ── Formatters ────────────────────────────────────────────────────────────────

describe("format helpers", () => {
  it("formats durations across scales", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(65_000)).toBe("1m 5s");
  });

  it("formats signed deltas", () => {
    expect(formatDeltaMs(0)).toBe("0ms");
    expect(formatDeltaMs(1500)).toBe("+1.5s");
    expect(formatDeltaMs(-340)).toBe("-340ms");
  });

  it("maps status to a badge variant", () => {
    expect(statusVariant("success")).toBe("default");
    expect(statusVariant("error")).toBe("destructive");
    expect(statusVariant("running")).toBe("secondary");
    expect(statusVariant("cancelled")).toBe("outline");
  });

  it("renders recent timestamps as relative", () => {
    expect(formatRelativeTime(Date.now())).toBe("just now");
  });
});

// ── Filter-state round-trip (workbench ⇄ query string) ─────────────────────────

describe("trace filter serialization", () => {
  it("round-trips filters through buildTraceQuery → parseTraceParams", () => {
    const params = {
      q: "hi",
      status: "error",
      from: 100,
      to: 200,
      model: "gpt-4o",
      tool: "search",
      hasError: true,
      favorite: true,
      tag: "prod",
      sort: "durationMs" as const,
      order: "asc" as const,
      limit: 10,
      offset: 20,
    };
    const parsed = parseTraceParams(new URLSearchParams(buildTraceQuery(params)));
    expect(parsed).toMatchObject(params);
  });

  it("drops empty/all values", () => {
    const qs = buildTraceQuery({ status: undefined, q: "" });
    const parsed = parseTraceParams(new URLSearchParams(qs));
    expect(parsed.q).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    // `status=all` is treated as no filter.
    expect(parseTraceParams(new URLSearchParams("status=all")).status).toBeUndefined();
  });
});

// ── Hotspots ────────────────────────────────────────────────────────────────

function span(p: Partial<SpanRow> & Pick<SpanRow, "id">): SpanRow {
  return {
    traceId: "t",
    parentId: null,
    name: p.id,
    kind: "custom",
    status: "success",
    startedAt: 0,
    endedAt: null,
    durationMs: null,
    attributes: null,
    ...p,
  };
}
function model(p: Partial<ModelCallRow> & Pick<ModelCallRow, "id">): ModelCallRow {
  return {
    traceId: "t",
    spanId: null,
    provider: "openai",
    model: "gpt-4o",
    prompt: null,
    messages: null,
    response: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCostUsd: null,
    startedAt: 0,
    endedAt: null,
    durationMs: null,
    metadata: null,
    ...p,
  };
}
function tool(p: Partial<ToolCallRow> & Pick<ToolCallRow, "id">): ToolCallRow {
  return {
    traceId: "t",
    spanId: null,
    toolName: p.id,
    input: null,
    output: null,
    status: "success",
    startedAt: 0,
    endedAt: null,
    durationMs: null,
    error: null,
    metadata: null,
    ...p,
  };
}
function event(p: Partial<EventRow> & Pick<EventRow, "id">): EventRow {
  return {
    traceId: "t",
    parentId: null,
    type: "log",
    name: p.id,
    timestamp: 0,
    durationMs: null,
    input: null,
    output: null,
    error: null,
    metadata: null,
    ...p,
  };
}

function makeDetail(): TraceDetail {
  return {
    trace: {
      id: "t",
      name: "hot",
      status: "success",
      startedAt: 0,
      endedAt: 1000,
      durationMs: 1000,
    },
    events: [event({ id: "e1", type: "error", name: "err" }), event({ id: "e2" })],
    spans: [
      span({
        id: "s1",
        kind: "agent",
        durationMs: 1000,
        children: [
          span({ id: "s2", kind: "tool", durationMs: 600, status: "error" }),
        ],
      }),
    ],
    modelCalls: [
      model({ id: "m1", durationMs: 800, totalTokens: 1500, estimatedCostUsd: 0.0075 }),
      model({
        id: "m2",
        durationMs: 200,
        model: "gpt-4o-mini",
        totalTokens: 300,
        estimatedCostUsd: 0.01,
      }),
    ],
    toolCalls: [
      tool({ id: "tc1", durationMs: 600, status: "error" }),
      tool({ id: "tc2", durationMs: 100 }),
    ],
  };
}

describe("flattenSpans", () => {
  it("flattens a nested span tree depth-first", () => {
    const flat = flattenSpans(makeDetail().spans);
    expect(flat.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("computeHotspots", () => {
  const hotspots = computeHotspots(makeDetail());

  it("ranks slowest spans, model calls, and tools", () => {
    expect(hotspots.slowestSpans[0].id).toBe("s1");
    expect(hotspots.slowestSpans[0].durationMs).toBe(1000);
    expect(hotspots.slowestModelCalls[0].id).toBe("m1");
    expect(hotspots.slowestModelCalls[0].detail).toContain("1,500 tok");
    expect(hotspots.slowestTools[0].id).toBe("tc1");
  });

  it("collects errors from events, tools, and spans", () => {
    const ids = hotspots.errors.map((e) => e.id);
    expect(ids).toContain("e1");
    expect(ids).toContain("tc1");
    expect(ids).toContain("s2");
    // Events are listed first.
    expect(hotspots.errors[0].id).toBe("e1");
  });

  it("builds a critical shortlist with the most expensive model call", () => {
    expect(hotspots.critical[0].id).toBe("e1");
    expect(hotspots.critical.some((h) => h.id === "m2")).toBe(true);
    expect(hotspots.critical.length).toBeLessThanOrEqual(5);
  });

  it("totals tokens and cost", () => {
    expect(hotspots.totalTokens).toBe(1800);
    expect(hotspots.estimatedCostUsd).toBeCloseTo(0.0175, 6);
  });
});
