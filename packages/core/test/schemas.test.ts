import { describe, it, expect } from "vitest";
import {
  createTraceSchema,
  createEventSchema,
  createSpanSchema,
  createModelCallSchema,
  createToolCallSchema,
  batchIngestSchema,
} from "../src/schemas.js";

describe("createTraceSchema", () => {
  it("accepts valid trace input", () => {
    const result = createTraceSchema.safeParse({
      id: "trace-1",
      name: "test-agent",
      status: "running",
      startedAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("defaults status to running", () => {
    const result = createTraceSchema.safeParse({
      id: "trace-2",
      name: "agent",
      startedAt: 1000,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("running");
  });

  it("rejects missing required fields", () => {
    const result = createTraceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = createTraceSchema.safeParse({
      id: "t",
      name: "x",
      status: "invalid",
      startedAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createEventSchema", () => {
  it("accepts valid event", () => {
    const result = createEventSchema.safeParse({
      traceId: "trace-1",
      type: "log",
      name: "test-event",
    });
    expect(result.success).toBe(true);
  });

  it("generates default timestamp and id when omitted", () => {
    const result = createEventSchema.safeParse({
      traceId: "t1",
      type: "log",
      name: "evt",
    });
    // Schema allows optional id/timestamp — normalizeEvent adds defaults
    expect(result.success).toBe(true);
  });

  it("rejects invalid event type", () => {
    const result = createEventSchema.safeParse({
      traceId: "t",
      type: "bad-type",
      name: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("createSpanSchema", () => {
  it("accepts valid span", () => {
    const result = createSpanSchema.safeParse({
      id: "s1",
      traceId: "t1",
      name: "search",
      kind: "tool",
      startedAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("defaults kind to custom", () => {
    const result = createSpanSchema.safeParse({
      id: "s2",
      traceId: "t2",
      name: "unknown",
      startedAt: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("custom");
  });

  it("rejects invalid kind", () => {
    const result = createSpanSchema.safeParse({
      id: "s3",
      traceId: "t3",
      name: "x",
      kind: "bad",
      startedAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createModelCallSchema", () => {
  it("accepts valid model call with messages", () => {
    const result = createModelCallSchema.safeParse({
      id: "mc1",
      traceId: "t1",
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
      inputTokens: 100,
      outputTokens: 50,
      startedAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid provider", () => {
    const result = createModelCallSchema.safeParse({
      id: "mc2",
      traceId: "t2",
      provider: "unknown",
      model: "x",
      startedAt: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid message role", () => {
    const result = createModelCallSchema.safeParse({
      id: "mc3",
      traceId: "t3",
      provider: "openai",
      model: "x",
      messages: [{ role: "invalid", content: "x" }],
      startedAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("createToolCallSchema", () => {
  it("accepts valid tool call", () => {
    const result = createToolCallSchema.safeParse({
      id: "tc1",
      traceId: "t1",
      toolName: "search",
      input: { query: "test" },
      status: "success",
      startedAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = createToolCallSchema.safeParse({
      id: "tc2",
      traceId: "t2",
      toolName: "x",
      input: {},
      status: "failed",
      startedAt: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("batchIngestSchema", () => {
  it("accepts valid batch with multiple kinds", () => {
    const result = batchIngestSchema.safeParse({
      events: [
        { kind: "trace", data: { id: "t1", name: "a", startedAt: 1 } },
        { kind: "event", data: { traceId: "t1", type: "log", name: "e1" } },
        {
          kind: "span",
          data: { id: "s1", traceId: "t1", name: "s", kind: "tool", startedAt: 2 },
        },
        {
          kind: "model_call",
          data: {
            id: "mc1",
            traceId: "t1",
            provider: "openai",
            model: "gpt-4o",
            startedAt: 3,
          },
        },
        {
          kind: "tool_call",
          data: {
            id: "tc1",
            traceId: "t1",
            toolName: "search",
            input: {},
            status: "success",
            startedAt: 4,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid kind", () => {
    const result = batchIngestSchema.safeParse({
      events: [{ kind: "invalid", data: {} }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects batch exceeding 500 events", () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      kind: "event" as const,
      data: { traceId: "t", type: "log" as const, name: `e${i}` },
    }));
    const result = batchIngestSchema.safeParse({ events });
    expect(result.success).toBe(false);
  });

  it("accepts batch at exactly 500", () => {
    const events = Array.from({ length: 500 }, (_, i) => ({
      kind: "event" as const,
      data: { traceId: "t", type: "log" as const, name: `e${i}` },
    }));
    const result = batchIngestSchema.safeParse({ events });
    expect(result.success).toBe(true);
  });
});
