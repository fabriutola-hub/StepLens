import { describe, it, expect } from "vitest";
import { MemoryCollector } from "../src/index.js";
import { createReplay } from "../src/simple.js";
import { wrapGoogleGenAI } from "../src/integrations/google.js";

/** Minimal fake Google GenAI client matching the structural shape we read. */
function makeFakeGoogleGenAI() {
  const calls = { generate: 0, stream: 0, list: 0 };
  const client = {
    models: {
      generateContent: async (_args: unknown) => {
        calls.generate++;
        return {
          text: "gemini says hi",
          candidates: [{ content: { parts: [{ text: "gemini says hi" }], role: "model" } }],
          usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 10 },
          modelVersion: "gemini-2.0-flash",
          responseId: "resp-1",
        };
      },
      generateContentStream: async (_args: unknown) => {
        calls.stream++;
        return (async function* () {
          yield { text: "gem" };
          yield {
            text: "ini",
            usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
            modelVersion: "gemini-2.0-flash",
            responseId: "resp-2",
          };
        })();
      },
      list: () => {
        calls.list++;
        return "models-ok";
      },
    },
  };
  return { client, calls };
}

describe("wrapGoogleGenAI", () => {
  it("records generateContent with text and usageMetadata", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeGoogleGenAI();
    const ai = wrapGoogleGenAI(client, { replay });

    await replay.record("Gemini Agent", async () => {
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Say hello",
      });
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("google");
    expect(mc.model).toBe("gemini-2.0-flash");
    expect(mc.prompt).toBe("Say hello");
    expect(mc.response).toBe("gemini says hi");
    expect(mc.inputTokens).toBe(7);
    expect(mc.outputTokens).toBe(3);
    expect(mc.estimatedCostUsd).toBeGreaterThan(0);
    expect(mc.metadata?.modelVersion).toBe("gemini-2.0-flash");
    expect(mc.metadata?.responseId).toBe("resp-1");
    expect(mc.metadata?.totalTokenCount).toBe(10);
    expect(mc.endedAt).toBeGreaterThanOrEqual(mc.startedAt);
  });

  it("coerces structured contents into messages", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeGoogleGenAI();
    const ai = wrapGoogleGenAI(client, { replay });

    await replay.record("Structured Contents", async () => {
      await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
          { role: "model", parts: [{ text: "Hi!" }] },
        ],
      });
    });

    expect(collector.modelCalls[0].messages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ]);
  });

  it("records generateContentStream once the stream is fully consumed", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeGoogleGenAI();
    const ai = wrapGoogleGenAI(client, { replay });

    await replay.record("Streaming Gemini", async () => {
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.0-flash",
        contents: "Count",
      });
      const seen: string[] = [];
      for await (const chunk of stream as AsyncIterable<{ text?: string }>) {
        if (chunk.text) seen.push(chunk.text);
      }
      expect(seen).toEqual(["gem", "ini"]);
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.response).toBe("gemini");
    expect(mc.inputTokens).toBe(4);
    expect(mc.outputTokens).toBe(2);
    expect(mc.metadata?.streamed).toBe(true);
    expect(mc.metadata?.totalTokenCount).toBe(6);
    expect(mc.metadata?.responseId).toBe("resp-2");
  });

  it("records nothing when the consumer breaks out of the stream early", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeGoogleGenAI();
    const ai = wrapGoogleGenAI(client, { replay });

    await replay.record("Abandoned Stream", async () => {
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.0-flash",
        contents: "Count",
      });
      for await (const _chunk of stream as AsyncIterable<unknown>) {
        break;
      }
    });

    expect(collector.modelCalls).toHaveLength(0);
  });

  it("records a failed generateContent and re-throws", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const client = {
      models: {
        generateContent: async () => {
          throw new Error("quota exceeded");
        },
      },
    };
    const ai = wrapGoogleGenAI(client, { replay });

    await expect(
      replay.record("Failing", async () => {
        await ai.models.generateContent({ model: "gemini-2.0-flash", contents: "Hi" });
      }),
    ).rejects.toThrow("quota exceeded");

    expect(collector.modelCalls).toHaveLength(1);
    expect(
      (collector.modelCalls[0].metadata?.error as { message?: string })?.message,
    ).toBe("quota exceeded");
  });

  it("passes through and records nothing outside a record() run", async () => {
    const collector = new MemoryCollector();
    createReplay({ collector });
    const { client, calls } = makeFakeGoogleGenAI();
    const ai = wrapGoogleGenAI(client);

    const res = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: "Hi" });
    expect((res as { text: string }).text).toBe("gemini says hi");
    expect(calls.generate).toBe(1);
    expect(collector.modelCalls).toHaveLength(0);
  });

  it("leaves other client methods untouched", () => {
    const { client } = makeFakeGoogleGenAI();
    const ai = wrapGoogleGenAI(client);
    expect(ai.models.list()).toBe("models-ok");
  });
});
