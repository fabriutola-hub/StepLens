import { describe, it, expect } from "vitest";
import { AgentReplayClient, MemoryCollector } from "../src/index.js";

describe("AgentReplayClient", () => {
  it("creates a client with default MemoryCollector", () => {
    const client = new AgentReplayClient();
    expect(client.collector).toBeDefined();
    expect(client.collector).toBeInstanceOf(MemoryCollector);
    expect(client.enabled).toBe(true);
  });

  it("creates a client with custom collector", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    expect(client.collector).toBe(collector);
  });

  it("disables recording when enabled is false", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector, enabled: false });
    const trace = client.startTrace("disabled-agent");
    trace.end();
    expect(collector.traces.length).toBe(0);
  });

  it("records traces when enabled", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("test-agent", { input: "hello" });
    expect(trace.id).toBeDefined();
    expect(trace.name).toBe("test-agent");
    expect(trace.status).toBe("running");

    trace.end();
    expect(trace.status).toBe("success");
    expect(collector.traces.length).toBeGreaterThan(0);
  });

  it("handles run() helper", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });

    const result = await client.run("run-agent", async (trace) => {
      const span = trace.startSpan("step", { kind: "tool" });
      span.end();
      return "done";
    });

    expect(result).toBe("done");
    expect(collector.traces.length).toBeGreaterThan(0);
    expect(collector.spans.length).toBeGreaterThan(0);
  });

  it("fails trace in run() when function throws", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });

    await expect(
      client.run("failing-run", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(collector.traces.length).toBeGreaterThan(0);
    expect(collector.traces[collector.traces.length - 1].status).toBe("error");
  });

  it("setEnabled toggles recording", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    client.setEnabled(false);
    const trace = client.startTrace("off");
    trace.end();
    expect(collector.traces.length).toBe(0);

    client.setEnabled(true);
    const trace2 = client.startTrace("on");
    trace2.end();
    expect(collector.traces.length).toBeGreaterThan(0);
  });

  it("records complete trace lifecycle with all event types", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("full-test", { input: "start", metadata: { env: "test" } });

    const span1 = trace.startSpan("search", { kind: "tool" });
    trace.recordToolCall({
      toolName: "search",
      input: { query: "test" },
      spanId: span1.id,
    });
    span1.end();

    const span2 = trace.startSpan("llm", { kind: "model" });
    trace.recordModelCall({
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
      inputTokens: 100,
      outputTokens: 50,
      spanId: span2.id,
    });
    span2.end();

    trace.recordEvent("log", "done");
    trace.end();

    // MemoryCollector upserts traces by id, so start+end = 1 entry
    expect(collector.traces.length).toBeGreaterThanOrEqual(1);
    expect(collector.spans.length).toBeGreaterThanOrEqual(2); // start + end each span
    expect(collector.modelCalls.length).toBe(1);
    expect(collector.toolCalls.length).toBe(1);
    expect(collector.events.length).toBe(1);

    expect(collector.modelCalls[0].estimatedCostUsd).toBeDefined();
    expect(collector.modelCalls[0].estimatedCostUsd).toBeGreaterThan(0);
  });
});
