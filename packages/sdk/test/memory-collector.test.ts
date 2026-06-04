import { describe, it, expect } from "vitest";
import { MemoryCollector } from "../src/index.js";

describe("MemoryCollector", () => {
  it("stores traces on start and end", () => {
    const collector = new MemoryCollector();
    collector.onTraceStart({
      id: "t1",
      name: "test",
      status: "running",
      startedAt: 1000,
    });
    expect(collector.traces).toHaveLength(1);
    expect(collector.traces[0].name).toBe("test");
    expect(collector.traces[0].status).toBe("running");

    collector.onTraceEnd({
      id: "t1",
      name: "test",
      status: "success",
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
    });
    expect(collector.traces).toHaveLength(1);
    expect(collector.traces[0].status).toBe("success");
  });

  it("upserts trace on duplicate ID", () => {
    const collector = new MemoryCollector();
    collector.onTraceStart({ id: "t2", name: "agent", status: "running", startedAt: 1000 });
    collector.onTraceStart({ id: "t2", name: "agent", status: "running", startedAt: 1000 });
    expect(collector.traces).toHaveLength(1);
  });

  it("stores events", () => {
    const collector = new MemoryCollector();
    collector.onEvent({
      id: "e1",
      traceId: "t1",
      type: "log",
      name: "log-event",
      timestamp: 1000,
    });
    collector.onEvent({
      id: "e2",
      traceId: "t1",
      type: "error",
      name: "err-event",
      timestamp: 2000,
    });
    expect(collector.events).toHaveLength(2);
  });

  it("stores spans with upsert", () => {
    const collector = new MemoryCollector();
    collector.onSpanStart({
      id: "s1",
      traceId: "t1",
      name: "search",
      kind: "tool",
      status: "running",
      startedAt: 1000,
    });
    expect(collector.spans).toHaveLength(1);

    collector.onSpanEnd({
      id: "s1",
      traceId: "t1",
      name: "search",
      kind: "tool",
      status: "success",
      startedAt: 1000,
      endedAt: 1500,
      durationMs: 500,
    });
    expect(collector.spans).toHaveLength(1);
    expect(collector.spans[0].status).toBe("success");
  });

  it("stores model calls", () => {
    const collector = new MemoryCollector();
    collector.onModelCall({
      id: "mc1",
      traceId: "t1",
      provider: "openai",
      model: "gpt-4o",
      startedAt: 1000,
    });
    expect(collector.modelCalls).toHaveLength(1);
  });

  it("stores tool calls", () => {
    const collector = new MemoryCollector();
    collector.onToolCall({
      id: "tc1",
      traceId: "t1",
      toolName: "search",
      input: { q: "x" },
      status: "success",
      startedAt: 1000,
    });
    expect(collector.toolCalls).toHaveLength(1);
  });

  it("filters events by trace", () => {
    const collector = new MemoryCollector();
    collector.onEvent({ id: "e1", traceId: "t1", type: "log", name: "a", timestamp: 1 });
    collector.onEvent({ id: "e2", traceId: "t2", type: "log", name: "b", timestamp: 2 });
    collector.onEvent({ id: "e3", traceId: "t1", type: "log", name: "c", timestamp: 3 });

    const t1Events = collector.getEventsByTrace("t1");
    expect(t1Events).toHaveLength(2);
  });

  it("filters spans by trace", () => {
    const collector = new MemoryCollector();
    collector.onSpanStart({ id: "s1", traceId: "t1", name: "a", kind: "tool", status: "running", startedAt: 1 });
    collector.onSpanStart({ id: "s2", traceId: "t2", name: "b", kind: "tool", status: "running", startedAt: 2 });

    expect(collector.getSpansByTrace("t1")).toHaveLength(1);
    expect(collector.getSpansByTrace("t2")).toHaveLength(1);
  });

  it("filters model calls by trace", () => {
    const collector = new MemoryCollector();
    collector.onModelCall({ id: "m1", traceId: "t1", provider: "openai", model: "gpt-4o", startedAt: 1 });
    collector.onModelCall({ id: "m2", traceId: "t2", provider: "openai", model: "gpt-4o", startedAt: 2 });

    expect(collector.getModelCallsByTrace("t1")).toHaveLength(1);
  });

  it("filters tool calls by trace", () => {
    const collector = new MemoryCollector();
    collector.onToolCall({ id: "c1", traceId: "t1", toolName: "x", input: {}, status: "success", startedAt: 1 });
    collector.onToolCall({ id: "c2", traceId: "t2", toolName: "y", input: {}, status: "success", startedAt: 2 });

    expect(collector.getToolCallsByTrace("t1")).toHaveLength(1);
  });

  it("returns full trace detail", () => {
    const collector = new MemoryCollector();
    collector.onTraceStart({ id: "td1", name: "agent", status: "running", startedAt: 1000 });
    collector.onEvent({ id: "e1", traceId: "td1", type: "log", name: "evt", timestamp: 1100 });
    collector.onSpanStart({ id: "s1", traceId: "td1", name: "span", kind: "tool", status: "running", startedAt: 1050 });

    const detail = collector.getTraceDetail("td1");
    expect(detail.trace).toBeDefined();
    expect(detail.events).toHaveLength(1);
    expect(detail.spans).toHaveLength(1);
  });

  it("clear() removes all data", () => {
    const collector = new MemoryCollector();
    collector.onTraceStart({ id: "t1", name: "x", status: "running", startedAt: 1 });
    collector.onEvent({ id: "e1", traceId: "t1", type: "log", name: "e", timestamp: 1 });

    collector.clear();
    expect(collector.traces).toHaveLength(0);
    expect(collector.events).toHaveLength(0);
    expect(collector.spans).toHaveLength(0);
    expect(collector.modelCalls).toHaveLength(0);
    expect(collector.toolCalls).toHaveLength(0);
  });
});
