import { describe, it, expect, vi } from "vitest";
import { MemoryCollector } from "../src/index.js";
import { createReplay } from "../src/simple.js";
import { wrapAISDK } from "../src/integrations/vercel-ai.js";

/** Fake `generateText` resolving with a single-step result. */
const fakeGenerateText = async (options: {
  model?: unknown;
  prompt?: string;
}) => ({
  text: `answer to: ${options.prompt}`,
  usage: { inputTokens: 30, outputTokens: 12, totalTokens: 42 },
  finishReason: "stop",
});

describe("wrapAISDK generateText", () => {
  it("records text, tokens, and model info from a gateway model string", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const ai = wrapAISDK({ generateText: fakeGenerateText }, { replay });

    await replay.record("AI SDK Agent", async () => {
      const result = await ai.generateText({
        model: "openai/gpt-4o-mini",
        prompt: "Hello",
      });
      expect(result.text).toBe("answer to: Hello");
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("openai");
    expect(mc.model).toBe("gpt-4o-mini");
    expect(mc.prompt).toBe("Hello");
    expect(mc.response).toBe("answer to: Hello");
    expect(mc.inputTokens).toBe(30);
    expect(mc.outputTokens).toBe(12);
    expect(mc.estimatedCostUsd).toBeGreaterThan(0);
    expect(mc.endedAt).toBeGreaterThanOrEqual(mc.startedAt);
  });

  it("extracts provider/modelId from a language model object", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const ai = wrapAISDK({ generateText: fakeGenerateText }, { replay });

    await replay.record("Model Object", async () => {
      await ai.generateText({
        model: { provider: "anthropic.messages", modelId: "claude-3-5-haiku-20241022" },
        prompt: "Hi",
      });
    });

    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("anthropic");
    expect(mc.model).toBe("claude-3-5-haiku-20241022");
  });

  it("records steps and tool calls from a multi-step result", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const multiStep = async (_options: unknown) => ({
      text: "final answer",
      usage: { inputTokens: 30, outputTokens: 12 },
      steps: [
        {
          text: "",
          usage: { inputTokens: 10, outputTokens: 4 },
          finishReason: "tool-calls",
          toolCalls: [{ toolCallId: "call-1", toolName: "search", input: { q: "x" } }],
          toolResults: [{ toolCallId: "call-1", toolName: "search", output: { hits: 2 } }],
        },
        { text: "final answer", usage: { inputTokens: 20, outputTokens: 8 }, finishReason: "stop" },
      ],
    });
    const ai = wrapAISDK({ generateText: multiStep }, { replay });

    await replay.record("Multi-step", async () => {
      await ai.generateText({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] });
    });

    expect(collector.modelCalls).toHaveLength(2);
    // First step carries the request messages; second does not.
    expect(collector.modelCalls[0].messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(collector.modelCalls[0].inputTokens).toBe(10);
    expect(collector.modelCalls[1].response).toBe("final answer");
    expect(collector.modelCalls[1].outputTokens).toBe(8);

    expect(collector.toolCalls).toHaveLength(1);
    const tc = collector.toolCalls[0];
    expect(tc.toolName).toBe("search");
    expect(tc.input).toEqual({ q: "x" });
    expect(tc.output).toEqual({ hits: 2 });
  });

  it("records steps live via onStepFinish and preserves the user's callback", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const withStepCallbacks = async (options: {
      onStepFinish?: (step: unknown) => unknown;
    }) => {
      await options.onStepFinish?.({ text: "step one", usage: { inputTokens: 3, outputTokens: 1 } });
      return { text: "step one", usage: { inputTokens: 3, outputTokens: 1 }, steps: [{ text: "step one" }] };
    };
    const userOnStepFinish = vi.fn();
    const ai = wrapAISDK({ generateText: withStepCallbacks }, { replay });

    await replay.record("Step callbacks", async () => {
      await ai.generateText({
        model: "openai/gpt-4o-mini",
        prompt: "Hi",
        onStepFinish: userOnStepFinish,
      });
    });

    // Recorded once via onStepFinish — not again from the final result.
    expect(collector.modelCalls).toHaveLength(1);
    expect(collector.modelCalls[0].response).toBe("step one");
    expect(userOnStepFinish).toHaveBeenCalledTimes(1);
  });

  it("records a failed call and re-throws", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const failing = async () => {
      throw new Error("model exploded");
    };
    const ai = wrapAISDK({ generateText: failing }, { replay });

    await expect(
      replay.record("Failing", async () => {
        await ai.generateText({ model: "openai/gpt-4o-mini", prompt: "Hi" });
      }),
    ).rejects.toThrow("model exploded");

    expect(collector.modelCalls).toHaveLength(1);
    expect(
      (collector.modelCalls[0].metadata?.error as { message?: string })?.message,
    ).toBe("model exploded");
  });

  it("passes through and records nothing outside a record() run", async () => {
    const collector = new MemoryCollector();
    createReplay({ collector });
    const ai = wrapAISDK({ generateText: fakeGenerateText });

    const result = await ai.generateText({ model: "openai/gpt-4o", prompt: "Hi" });
    expect(result.text).toBe("answer to: Hi");
    expect(collector.modelCalls).toHaveLength(0);
  });
});

describe("wrapAISDK streamText", () => {
  /** Fake `streamText`: returns immediately, fires onFinish synchronously. */
  const fakeStreamText = (options: {
    onFinish?: (event: unknown) => unknown;
  }) => {
    options.onFinish?.({
      text: "streamed!",
      usage: { inputTokens: 5, outputTokens: 2 },
      finishReason: "stop",
    });
    return { textStream: (async function* () { yield "streamed!"; })() };
  };

  it("records via onFinish and preserves the user's onFinish callback", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const userOnFinish = vi.fn();
    const ai = wrapAISDK({ streamText: fakeStreamText }, { replay });

    await replay.record("Stream Agent", async () => {
      ai.streamText({
        model: "openai/gpt-4o-mini",
        prompt: "Hello",
        onFinish: userOnFinish,
      });
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.response).toBe("streamed!");
    expect(mc.inputTokens).toBe(5);
    expect(mc.outputTokens).toBe(2);
    expect(mc.metadata?.streamed).toBe(true);
    expect(userOnFinish).toHaveBeenCalledTimes(1);
    expect(userOnFinish).toHaveBeenCalledWith(
      expect.objectContaining({ text: "streamed!" }),
    );
  });

  it("records a failure via onError and preserves the user's onError callback", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const failingStream = (options: { onError?: (event: { error?: unknown }) => unknown }) => {
      options.onError?.({ error: new Error("stream broke") });
      return { textStream: (async function* () {})() };
    };
    const userOnError = vi.fn();
    const ai = wrapAISDK({ streamText: failingStream }, { replay });

    await replay.record("Stream Error", async () => {
      ai.streamText({ model: "openai/gpt-4o-mini", prompt: "Hello", onError: userOnError });
    });

    expect(collector.modelCalls).toHaveLength(1);
    expect(
      (collector.modelCalls[0].metadata?.error as { message?: string })?.message,
    ).toBe("stream broke");
    expect(userOnError).toHaveBeenCalledTimes(1);
  });

  it("records nothing when the stream never finishes (onFinish never fires)", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const neverFinishes = (_options: unknown) => ({
      textStream: (async function* () {})(),
    });
    const ai = wrapAISDK({ streamText: neverFinishes }, { replay });

    await replay.record("Never consumed", async () => {
      ai.streamText({ model: "openai/gpt-4o-mini", prompt: "Hello" });
    });

    expect(collector.modelCalls).toHaveLength(0);
  });
});

describe("wrapAISDK generateObject / streamObject", () => {
  it("records generateObject with the object serialized as the response", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const fakeGenerateObject = async (_options: unknown) => ({
      object: { city: "Madrid" },
      usage: { inputTokens: 8, outputTokens: 4 },
    });
    const ai = wrapAISDK({ generateObject: fakeGenerateObject }, { replay });

    await replay.record("Object Agent", async () => {
      await ai.generateObject({ model: "openai/gpt-4o-mini", prompt: "Where?" });
    });

    expect(collector.modelCalls).toHaveLength(1);
    expect(collector.modelCalls[0].response).toBe(JSON.stringify({ city: "Madrid" }));
    expect(collector.modelCalls[0].inputTokens).toBe(8);
  });

  it("records streamObject via onFinish", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const fakeStreamObject = (options: { onFinish?: (event: unknown) => unknown }) => {
      options.onFinish?.({ object: { ok: true }, usage: { inputTokens: 2, outputTokens: 1 } });
      return {};
    };
    const ai = wrapAISDK({ streamObject: fakeStreamObject }, { replay });

    await replay.record("Stream Object", async () => {
      ai.streamObject({ model: "openai/gpt-4o-mini", prompt: "Hi" });
    });

    expect(collector.modelCalls).toHaveLength(1);
    expect(collector.modelCalls[0].response).toBe(JSON.stringify({ ok: true }));
    expect(collector.modelCalls[0].metadata?.streamed).toBe(true);
  });
});
