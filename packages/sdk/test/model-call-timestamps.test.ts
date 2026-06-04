import { describe, it, expect } from "vitest";
import { AgentReplayClient, MemoryCollector } from "../src/index.js";

describe("Trace.recordModelCall timestamps", () => {
  it("accepts explicit startedAt/endedAt and derives durationMs", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("Timestamps");

    const call = trace.recordModelCall({
      provider: "openai",
      model: "gpt-4o",
      startedAt: 1_000,
      endedAt: 1_500,
    });

    expect(call.startedAt).toBe(1_000);
    expect(call.endedAt).toBe(1_500);
    expect(call.durationMs).toBe(500);
    trace.end();
  });

  it("respects an explicit durationMs over the derived one", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("Explicit duration");

    const call = trace.recordModelCall({
      provider: "openai",
      model: "gpt-4o",
      startedAt: 1_000,
      endedAt: 1_500,
      durationMs: 42,
    });

    expect(call.durationMs).toBe(42);
    trace.end();
  });

  it("stays backward compatible when no timestamps are given", () => {
    const collector = new MemoryCollector();
    const client = new AgentReplayClient({ collector });
    const trace = client.startTrace("Defaults");

    const before = Date.now();
    const call = trace.recordModelCall({ provider: "openai", model: "gpt-4o" });
    const after = Date.now();

    expect(call.startedAt).toBeGreaterThanOrEqual(before);
    expect(call.startedAt).toBeLessThanOrEqual(after);
    expect(call.endedAt).toBeUndefined();
    expect(call.durationMs).toBeUndefined();
    trace.end();
  });
});
