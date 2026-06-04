import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema.js";

function createTestDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function ensureTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
      started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER,
      input TEXT, output TEXT, metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      parent_id TEXT, type TEXT NOT NULL, name TEXT NOT NULL,
      timestamp INTEGER NOT NULL, duration_ms INTEGER, input TEXT, output TEXT, error TEXT, metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS spans (
      id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      parent_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'custom',
      status TEXT NOT NULL DEFAULT 'running',
      started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, attributes TEXT
    );
    CREATE TABLE IF NOT EXISTS model_calls (
      id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      span_id TEXT REFERENCES spans(id) ON DELETE SET NULL,
      provider TEXT NOT NULL, model TEXT NOT NULL,
      prompt TEXT, messages TEXT, response TEXT,
      input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER,
      estimated_cost_usd REAL, started_at INTEGER NOT NULL,
      ended_at INTEGER, duration_ms INTEGER, metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      span_id TEXT REFERENCES spans(id) ON DELETE SET NULL,
      tool_name TEXT NOT NULL, input TEXT, output TEXT, status TEXT NOT NULL DEFAULT 'running',
      started_at INTEGER NOT NULL, ended_at INTEGER, duration_ms INTEGER, error TEXT, metadata TEXT
    );
  `);
}

describe("DB operations", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    ensureTables(sqlite);
    db = createTestDb(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("inserts and reads a trace", () => {
    db.insert(schema.traces).values({
      id: "t1",
      name: "test-agent",
      status: "running",
      startedAt: Date.now(),
    }).run();

    const rows = db.select().from(schema.traces).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("test-agent");
  });

  it("inserts events associated with a trace", () => {
    db.insert(schema.traces).values({
      id: "t-evt",
      name: "evt-agent",
      startedAt: Date.now(),
    }).run();

    db.insert(schema.events).values({
      id: "e1",
      traceId: "t-evt",
      type: "log",
      name: "log-event",
      timestamp: Date.now(),
    }).run();

    const evts = db.select().from(schema.events)
      .where(eq(schema.events.traceId, "t-evt"))
      .all();
    expect(evts).toHaveLength(1);
  });

  it("inserts spans with parent-child relationships", () => {
    db.insert(schema.traces).values({
      id: "t-span",
      name: "span-agent",
      startedAt: Date.now(),
    }).run();

    db.insert(schema.spans).values({
      id: "s-root",
      traceId: "t-span",
      name: "root",
      kind: "agent",
      startedAt: Date.now(),
    }).run();

    db.insert(schema.spans).values({
      id: "s-child",
      traceId: "t-span",
      parentId: "s-root",
      name: "child",
      kind: "tool",
      startedAt: Date.now() + 1,
    }).run();

    const spans = db.select().from(schema.spans).all();
    expect(spans).toHaveLength(2);
    const child = spans.find((s) => s.id === "s-child");
    expect(child!.parentId).toBe("s-root");
  });

  it("inserts model calls with cost", () => {
    db.insert(schema.traces).values({
      id: "t-mc",
      name: "model-agent",
      startedAt: Date.now(),
    }).run();

    db.insert(schema.modelCalls).values({
      id: "mc1",
      traceId: "t-mc",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 200,
      outputTokens: 100,
      estimatedCostUsd: 0.0015,
      startedAt: Date.now(),
    }).run();

    const calls = db.select().from(schema.modelCalls)
      .where(eq(schema.modelCalls.traceId, "t-mc"))
      .all();
    expect(calls).toHaveLength(1);
    expect(calls[0].estimatedCostUsd).toBe(0.0015);
  });

  it("inserts tool calls with JSON input/output", () => {
    db.insert(schema.traces).values({
      id: "t-tc",
      name: "tool-agent",
      startedAt: Date.now(),
    }).run();

    db.insert(schema.toolCalls).values({
      id: "tc1",
      traceId: "t-tc",
      toolName: "calculator",
      input: JSON.stringify({ expr: "1+1" }),
      output: JSON.stringify({ result: 2 }),
      status: "success",
      startedAt: Date.now(),
    }).run();

    const calls = db.select().from(schema.toolCalls)
      .where(eq(schema.toolCalls.traceId, "t-tc"))
      .all();
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe("calculator");
  });

  it("supports pagination", () => {
    for (let i = 0; i < 25; i++) {
      db.insert(schema.traces).values({
        id: `t-page-${i}`,
        name: `agent-${i}`,
        startedAt: Date.now() + i,
      }).run();
    }

    expect(db.select().from(schema.traces).limit(10).offset(0).all()).toHaveLength(10);
    expect(db.select().from(schema.traces).limit(10).offset(10).all()).toHaveLength(10);
    expect(db.select().from(schema.traces).limit(10).offset(20).all()).toHaveLength(5);
  });

  it("deletes trace and cascades to children", () => {
    db.insert(schema.traces).values({
      id: "t-del",
      name: "delete-me",
      startedAt: Date.now(),
    }).run();
    db.insert(schema.events).values({
      id: "e-del",
      traceId: "t-del",
      type: "log",
      name: "bye",
      timestamp: Date.now(),
    }).run();

    db.delete(schema.traces).where(eq(schema.traces.id, "t-del")).run();

    expect(db.select().from(schema.traces).all()).toHaveLength(0);
    expect(db.select().from(schema.events).all()).toHaveLength(0);
  });
});
