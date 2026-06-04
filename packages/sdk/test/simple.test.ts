import { describe, it, expect } from "vitest";
import { MemoryCollector } from "../src/index.js";
import { createReplay, parseModelRef } from "../src/simple.js";

/** MemoryCollector with a flush counter to assert auto-flush behavior. */
class FlushyCollector extends MemoryCollector {
  flushes = 0;
  async flush(): Promise<void> {
    this.flushes++;
  }
}

function setup() {
  const collector = new FlushyCollector();
  const replay = createReplay({ collector });
  return { collector, replay };
}

describe("simple API — record", () => {
  it("creates a success trace and returns the result", async () => {
    const { collector, replay } = setup();
    const result = await replay.record("My Agent", async () => "done");
    expect(result).toBe("done");
    expect(collector.traces).toHaveLength(1);
    expect(collector.traces[0].status).toBe("success");
    expect(collector.traces[0].output).toBe("done");
  });

  it("marks the trace failed and re-throws on error", async () => {
    const { collector, replay } = setup();
    await expect(
      replay.record("My Agent", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(collector.traces[0].status).toBe("error");
  });

  it("flushes by default when record finishes, and can opt out", async () => {
    const { collector, replay } = setup();
    await replay.record("flush-on", async () => 1);
    expect(collector.flushes).toBe(1);
    await replay.record("flush-off", async () => 1, { flush: false });
    expect(collector.flushes).toBe(1); // unchanged
  });
});

describe("simple API — step", () => {
  it("opens and closes a span on success", async () => {
    const { collector, replay } = setup();
    await replay.record("agent", async (run) => {
      await run.step("work", async () => 42);
    });
    const span = collector.spans.find((s) => s.name === "work");
    expect(span).toBeDefined();
    expect(span!.status).toBe("success");
    expect(span!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("marks the span error and re-throws when the step fails", async () => {
    const { collector, replay } = setup();
    await replay
      .record("agent", async (run) => {
        await run.step("bad", async () => {
          throw new Error("nope");
        });
      })
      .catch(() => {});
    const span = collector.spans.find((s) => s.name === "bad");
    expect(span!.status).toBe("error");
  });

  it("preserves parent/child relationships for nested steps", async () => {
    const { collector, replay } = setup();
    await replay.record("agent", async (run) => {
      await run.step("outer", async (outer) => {
        await outer.step("inner", async () => "x");
      });
    });
    const outer = collector.spans.find((s) => s.name === "outer")!;
    const inner = collector.spans.find((s) => s.name === "inner")!;
    expect(outer.parentId).toBeUndefined();
    expect(inner.parentId).toBe(outer.id);
  });
});

describe("simple API — tool", () => {
  it("records output and a success span", async () => {
    const { collector, replay } = setup();
    await replay.record("agent", async (run) => {
      const out = await run.tool("search", { q: "hi" }, async () => ({ hits: 2 }));
      expect(out).toEqual({ hits: 2 });
    });
    expect(collector.toolCalls).toHaveLength(1);
    expect(collector.toolCalls[0].toolName).toBe("search");
    expect(collector.toolCalls[0].status).toBe("success");
    expect(collector.toolCalls[0].output).toEqual({ hits: 2 });
  });

  it("records an error tool call and re-throws", async () => {
    const { collector, replay } = setup();
    await replay
      .record("agent", async (run) => {
        await run.tool("search", { q: "x" }, async () => {
          throw new Error("tool fail");
        });
      })
      .catch(() => {});
    expect(collector.toolCalls[0].status).toBe("error");
    expect(collector.toolCalls[0].error?.message).toContain("tool fail");
  });
});

describe("simple API — model", () => {
  it('parses "provider:model" and records tokens and cost', async () => {
    const { collector, replay } = setup();
    await replay.record("agent", async (run) => {
      await run.model("openai:gpt-4o", { messages: [{ role: "user", content: "hi" }] }, async () => ({
        response: "hello",
        inputTokens: 1000,
        outputTokens: 500,
      }));
    });
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("openai");
    expect(mc.model).toBe("gpt-4o");
    expect(mc.response).toBe("hello");
    expect(mc.inputTokens).toBe(1000);
    expect(mc.outputTokens).toBe(500);
    // gpt-4o: 1000*0.0025/1k + 500*0.01/1k = 0.0075
    expect(mc.estimatedCostUsd).toBeCloseTo(0.0075, 6);
  });

  it("falls back to the custom provider for an unprefixed ref", () => {
    expect(parseModelRef("gpt-4o")).toEqual({ provider: "custom", model: "gpt-4o" });
    expect(parseModelRef("ollama:llama3")).toEqual({ provider: "ollama", model: "llama3" });
    expect(parseModelRef("weird:thing")).toEqual({ provider: "custom", model: "weird:thing" });
  });
});

describe("simple API — disabled", () => {
  it("records nothing and opens no HTTP when disabled", async () => {
    const collector = new FlushyCollector();
    // enabled:false ignores the collector and uses an internal no-op MemoryCollector.
    const replay = createReplay({ collector, enabled: false });
    expect(replay.enabled).toBe(false);
    const result = await replay.record("agent", async (run) => {
      await run.step("x", async () => 1);
      return "ok";
    });
    expect(result).toBe("ok");
    expect(collector.traces).toHaveLength(0);
  });
});
