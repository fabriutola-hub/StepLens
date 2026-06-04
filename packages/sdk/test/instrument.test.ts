import { describe, it, expect } from "vitest";
import { AgentReplayClient, MemoryCollector, withSpan, withModelCall, withToolCall } from "../src/index.js";

describe("instrument helpers", () => {
  it("withSpan wraps async function and captures timing", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("instrumented");

    let spanResult: any;
    const result = await withSpan(trace, "wrapped-op", async (span) => {
      spanResult = span;
      await new Promise((r) => setTimeout(r, 50));
      return "ok";
    }, { kind: "tool" });

    expect(result).toBe("ok");
    expect(spanResult).toBeDefined();
    expect(spanResult.status).toBe("success");
    expect(spanResult.durationMs).toBeGreaterThan(0);
    expect(collector.spans.length).toBeGreaterThan(0);
  });

  it("withSpan handles errors", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("error-test");

    let spanErr: any;
    await withSpan(trace, "failing-op", async (span) => {
      spanErr = span;
      throw new Error("expected fail");
    }, { kind: "tool" }).catch(() => {});

    expect(spanErr.status).toBe("error");
    expect(collector.spans.length).toBeGreaterThan(0);
    const lastSpan = collector.spans[collector.spans.length - 1];
    expect(lastSpan.status).toBe("error");
  });

  it("withModelCall captures model interaction", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("model-test");
    const span = trace.startSpan("llm-call", { kind: "model" });

    const result = await withModelCall(trace, {
      provider: "openai",
      model: "gpt-4o",
      spanId: span.id,
      messages: [{ role: "user", content: "hello" }],
    }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { response: "response text", inputTokens: 50, outputTokens: 30 };
    });

    span.end();
    trace.end();

    expect(result.response).toBe("response text");
    expect(collector.modelCalls.length).toBe(1);
    expect(collector.modelCalls[0].estimatedCostUsd).toBeDefined();
  });

  it("withToolCall captures tool execution", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("tool-test");
    const span = trace.startSpan("search-span", { kind: "tool" });

    const result = await withToolCall(trace, {
      toolName: "web_search",
      input: { query: "test" },
      spanId: span.id,
    }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { results: ["hit1", "hit2"] };
    });

    span.end();
    trace.end();

    expect(result.results).toHaveLength(2);
    expect(collector.toolCalls.length).toBe(1);
    expect(collector.toolCalls[0].toolName).toBe("web_search");
  });

  it("withToolCall handles tool errors", async () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("tool-error-test");
    const span = trace.startSpan("bad-tool", { kind: "tool" });

    await withToolCall(trace, {
      toolName: "broken_tool",
      input: {},
      spanId: span.id,
    }, async () => {
      throw new Error("tool failed");
    }).catch(() => {});

    span.end();
    trace.end();

    expect(collector.toolCalls.length).toBe(1);
    expect(collector.toolCalls[0].status).toBe("error");
  });
});
