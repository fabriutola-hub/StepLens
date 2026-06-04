import { describe, it, expect } from "vitest";
import { MemoryCollector } from "../src/index.js";
import { createReplay } from "../src/simple.js";
import { wrapAnthropic } from "../src/integrations/anthropic.js";

/** Minimal fake Anthropic client matching the structural shape we read. */
function makeFakeAnthropic() {
  const calls = { create: 0, stream: 0, count: 0 };
  const finalMessage = {
    id: "msg_123",
    model: "claude-3-5-haiku-20241022",
    role: "assistant",
    content: [
      { type: "text", text: "hi from " },
      { type: "text", text: "claude" },
    ],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 9,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 3,
    },
  };
  const client = {
    messages: {
      create: async (_args: unknown) => {
        calls.create++;
        return finalMessage;
      },
      stream: (_args: unknown) => {
        calls.stream++;
        return {
          finalMessage: async () => finalMessage,
          on: () => {},
        };
      },
      countTokens: () => {
        calls.count++;
        return "count-ok";
      },
    },
  };
  return { client, calls, finalMessage };
}

describe("wrapAnthropic", () => {
  it("records messages.create with model, response, and usage", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeAnthropic();
    const anthropic = wrapAnthropic(client, { replay });

    await replay.record("Anthropic Agent", async () => {
      await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        system: "Be brief.",
        messages: [{ role: "user", content: "Hello" }],
      });
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("anthropic");
    expect(mc.model).toBe("claude-3-5-haiku-20241022");
    expect(mc.response).toBe("hi from claude");
    expect(mc.inputTokens).toBe(9);
    expect(mc.outputTokens).toBe(5);
    expect(mc.estimatedCostUsd).toBeGreaterThan(0);
    expect(mc.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hello" },
    ]);
    expect(mc.metadata?.stop_reason).toBe("end_turn");
    expect(mc.metadata?.id).toBe("msg_123");
    expect(mc.metadata?.cache_read_input_tokens).toBe(3);
    expect(mc.endedAt).toBeGreaterThanOrEqual(mc.startedAt);
  });

  it("records messages.stream when finalMessage() resolves", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeAnthropic();
    const anthropic = wrapAnthropic(client, { replay });

    await replay.record("Streaming Agent", async () => {
      const stream = anthropic.messages.stream({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [{ role: "user", content: "Hello" }],
      });
      const final = await stream.finalMessage();
      expect((final as { id: string }).id).toBe("msg_123");
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.response).toBe("hi from claude");
    expect(mc.inputTokens).toBe(9);
    expect(mc.outputTokens).toBe(5);
    expect(mc.metadata?.streamed).toBe(true);
    expect(mc.metadata?.stop_reason).toBe("end_turn");
  });

  it("records nothing when finalMessage() is never called", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeAnthropic();
    const anthropic = wrapAnthropic(client, { replay });

    await replay.record("Abandoned Stream", async () => {
      anthropic.messages.stream({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [],
      });
    });

    expect(collector.modelCalls).toHaveLength(0);
  });

  it("passes through messages.create with stream: true unrecorded", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client, calls } = makeFakeAnthropic();
    const anthropic = wrapAnthropic(client, { replay });

    await replay.record("Raw Stream", async () => {
      await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [],
        stream: true,
      });
    });

    expect(calls.create).toBe(1);
    expect(collector.modelCalls).toHaveLength(0);
  });

  it("records a failed create and re-throws", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const client = {
      messages: {
        create: async () => {
          throw new Error("overloaded");
        },
      },
    };
    const anthropic = wrapAnthropic(client, { replay });

    await expect(
      replay.record("Failing", async () => {
        await anthropic.messages.create({ model: "claude-3-5-haiku-20241022", messages: [] });
      }),
    ).rejects.toThrow("overloaded");

    expect(collector.modelCalls).toHaveLength(1);
    expect(
      (collector.modelCalls[0].metadata?.error as { message?: string })?.message,
    ).toBe("overloaded");
  });

  it("passes through and records nothing outside a record() run", async () => {
    const collector = new MemoryCollector();
    createReplay({ collector });
    const { client, calls } = makeFakeAnthropic();
    const anthropic = wrapAnthropic(client);

    const res = await anthropic.messages.create({ model: "claude-3-5-haiku-20241022", messages: [] });
    expect((res as { id: string }).id).toBe("msg_123");
    expect(calls.create).toBe(1);
    expect(collector.modelCalls).toHaveLength(0);
  });

  it("leaves other client methods untouched", () => {
    const { client } = makeFakeAnthropic();
    const anthropic = wrapAnthropic(client);
    expect(anthropic.messages.countTokens()).toBe("count-ok");
  });
});
