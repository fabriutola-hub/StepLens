import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { formatCostUsd, computeSummary } from "../src/lib/timeline";
import type { TraceDetail } from "../src/lib/api";

// ── Cost formatting ───────────────────────────────────────────────────────────

describe("formatCostUsd", () => {
  it("renders an em dash for null and zero", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
    expect(formatCostUsd(0)).toBe("—");
  });

  it("formats sub-cent values as decimal USD (not cents)", () => {
    expect(formatCostUsd(0.0015)).toBe("$0.0015");
    expect(formatCostUsd(0.0075)).toBe("$0.0075");
  });

  it("collapses negligible values", () => {
    expect(formatCostUsd(0.00001)).toBe("<$0.0001");
  });

  it("formats dollar-scale values with two decimals", () => {
    expect(formatCostUsd(1.5)).toBe("$1.50");
    expect(formatCostUsd(12.3456)).toBe("$12.35");
  });
});

// ── Aggregation (computeSummary) ──────────────────────────────────────────────

function makeDetail(
  modelCalls: Array<{ totalTokens?: number; estimatedCostUsd?: number }>,
): TraceDetail {
  return {
    trace: {
      id: "t1",
      name: "agg",
      status: "success",
      startedAt: 0,
      endedAt: 100,
      durationMs: 100,
    },
    events: [],
    spans: [],
    // Only the fields computeSummary reads matter here.
    modelCalls: modelCalls.map((m, i) => ({
      id: `mc${i}`,
      traceId: "t1",
      spanId: null,
      provider: "openai",
      model: "gpt-4o",
      prompt: null,
      messages: null,
      response: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: m.totalTokens ?? null,
      estimatedCostUsd: m.estimatedCostUsd ?? null,
      startedAt: 0,
      endedAt: 10,
      durationMs: 10,
      metadata: null,
    })),
    toolCalls: [],
  };
}

describe("computeSummary aggregation", () => {
  it("sums estimated cost as decimal USD across model calls", () => {
    const detail = makeDetail([
      { totalTokens: 300, estimatedCostUsd: 0.0015 },
      { totalTokens: 500, estimatedCostUsd: 0.003 },
    ]);
    const summary = computeSummary(detail);
    expect(summary.estimatedCostUsd).toBeCloseTo(0.0045, 6);
    expect(summary.totalTokens).toBe(800);
    expect(summary.modelCallCount).toBe(2);
  });

  it("treats missing cost as zero", () => {
    const detail = makeDetail([{ totalTokens: 100 }, { estimatedCostUsd: 0.002 }]);
    const summary = computeSummary(detail);
    expect(summary.estimatedCostUsd).toBeCloseTo(0.002, 6);
  });
});

// ── Aggregation at the DB level (REAL column preserves decimals) ───────────────

describe("estimated_cost_usd column stores decimal dollars", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE traces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
        started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER,
        input TEXT, output TEXT, metadata TEXT
      );
      CREATE TABLE spans (
        id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'custom', status TEXT NOT NULL DEFAULT 'running',
        started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, attributes TEXT
      );
      CREATE TABLE model_calls (
        id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, span_id TEXT,
        provider TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT, messages TEXT, response TEXT,
        input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER,
        estimated_cost_usd REAL, started_at INTEGER NOT NULL, ended_at INTEGER,
        duration_ms INTEGER, metadata TEXT
      );
    `);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => sqlite.close());

  it("round-trips and sums decimal costs without truncation", () => {
    db.insert(schema.traces).values({ id: "t", name: "x", startedAt: 0 }).run();
    db.insert(schema.modelCalls).values([
      { id: "a", traceId: "t", provider: "openai", model: "gpt-4o", estimatedCostUsd: 0.0015, startedAt: 0 },
      { id: "b", traceId: "t", provider: "openai", model: "gpt-4o", estimatedCostUsd: 0.003, startedAt: 1 },
    ]).run();

    const [row] = db
      .select({ total: sql<number>`SUM(${schema.modelCalls.estimatedCostUsd})` })
      .from(schema.modelCalls)
      .where(eq(schema.modelCalls.traceId, "t"))
      .all();

    expect(Number(row.total)).toBeCloseTo(0.0045, 6);

    const single = db.select().from(schema.modelCalls).where(eq(schema.modelCalls.id, "a")).all();
    expect(single[0].estimatedCostUsd).toBe(0.0015);
  });
});
