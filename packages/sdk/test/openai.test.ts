import { describe, it, expect } from "vitest";
import { MemoryCollector } from "../src/index.js";
import { createReplay } from "../src/simple.js";
import { wrapOpenAI } from "../src/integrations/openai.js";

/** Minimal fake OpenAI client matching the structural shape we read. */
function makeFakeOpenAI() {
  const calls: { chat: number; responses: number; models: number } = {
    chat: 0,
    responses: 0,
    models: 0,
  };
  const client = {
    chat: {
      completions: {
        create: async (_args: unknown) => {
          calls.chat++;
          return {
            choices: [{ message: { content: "hello there" } }],
            usage: { prompt_tokens: 12, completion_tokens: 7 },
          };
        },
      },
    },
    responses: {
      create: async (_args: unknown) => {
        calls.responses++;
        return { output_text: "responded", usage: { input_tokens: 5, output_tokens: 3 } };
      },
    },
    models: {
      list: () => {
        calls.models++;
        return "models-ok";
      },
    },
  };
  return { client, calls };
}

describe("wrapOpenAI", () => {
  it("records chat.completions.create inside record()", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeOpenAI();
    const openai = wrapOpenAI(client, { replay });

    await replay.record("OpenAI Agent", async () => {
      await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      });
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("openai");
    expect(mc.model).toBe("gpt-4o-mini");
    expect(mc.response).toBe("hello there");
    expect(mc.inputTokens).toBe(12);
    expect(mc.outputTokens).toBe(7);
    expect(mc.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("records responses.create inside record()", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeOpenAI();
    const openai = wrapOpenAI(client, { replay });

    await replay.record("Responses Agent", async () => {
      await openai.responses.create({ model: "gpt-4o", input: "Hi" });
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.model).toBe("gpt-4o");
    expect(mc.response).toBe("responded");
    expect(mc.inputTokens).toBe(5);
    expect(mc.outputTokens).toBe(3);
  });

  it("passes through and records nothing outside a record() run", async () => {
    const collector = new MemoryCollector();
    createReplay({ collector }); // a replay exists, but we don't enter record()
    const { client, calls } = makeFakeOpenAI();
    const openai = wrapOpenAI(client);

    const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [] });
    expect((res as { choices: unknown[] }).choices).toHaveLength(1);
    expect(calls.chat).toBe(1);
    expect(collector.modelCalls).toHaveLength(0);
  });

  it("leaves other client methods untouched", () => {
    const { client } = makeFakeOpenAI();
    const openai = wrapOpenAI(client);
    expect(openai.models.list()).toBe("models-ok");
  });
});

/** Fake client whose create endpoints return async-iterable streams. */
function makeFakeStreamingOpenAI() {
  async function* chatChunks() {
    yield { choices: [{ delta: { content: "hel" } }] };
    yield { choices: [{ delta: { content: "lo" } }] };
    yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } };
  }
  async function* responseEvents() {
    yield { type: "response.output_text.delta", delta: "res" };
    yield { type: "response.output_text.delta", delta: "ponded" };
    yield {
      type: "response.completed",
      response: { usage: { input_tokens: 5, output_tokens: 3 } },
    };
  }
  const client = {
    chat: {
      completions: {
        create: async (_args: unknown) => chatChunks(),
      },
    },
    responses: {
      create: async (_args: unknown) => responseEvents(),
    },
  };
  return { client };
}

describe("wrapOpenAI streaming", () => {
  it("records a chat completions stream once it is fully consumed", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeStreamingOpenAI();
    const openai = wrapOpenAI(client, { replay });

    await replay.record("Streaming Agent", async () => {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      });
      const seen: string[] = [];
      for await (const chunk of stream as AsyncIterable<{
        choices?: Array<{ delta?: { content?: string } }>;
      }>) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) seen.push(delta);
      }
      expect(seen).toEqual(["hel", "lo"]);
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("openai");
    expect(mc.model).toBe("gpt-4o-mini");
    expect(mc.response).toBe("hello");
    expect(mc.inputTokens).toBe(10);
    expect(mc.outputTokens).toBe(2);
    expect(mc.metadata?.streamed).toBe(true);
    expect(mc.endedAt).toBeGreaterThanOrEqual(mc.startedAt);
  });

  it("records a responses stream from delta events and the completed event", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeStreamingOpenAI();
    const openai = wrapOpenAI(client, { replay });

    await replay.record("Responses Streaming", async () => {
      const stream = await openai.responses.create({
        model: "gpt-4o",
        input: "Hi",
        stream: true,
      });
      for await (const _event of stream as AsyncIterable<unknown>) {
        // consume to completion
      }
    });

    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.response).toBe("responded");
    expect(mc.prompt).toBe("Hi");
    expect(mc.inputTokens).toBe(5);
    expect(mc.outputTokens).toBe(3);
    expect(mc.metadata?.streamed).toBe(true);
  });

  it("records nothing when the consumer breaks out of the stream early", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const { client } = makeFakeStreamingOpenAI();
    const openai = wrapOpenAI(client, { replay });

    await replay.record("Abandoned Stream", async () => {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [],
        stream: true,
      });
      for await (const _chunk of stream as AsyncIterable<unknown>) {
        break; // bail after the first chunk
      }
    });

    expect(collector.modelCalls).toHaveLength(0);
  });

  it("passes streams through untouched outside a record() run", async () => {
    const collector = new MemoryCollector();
    createReplay({ collector });
    const { client } = makeFakeStreamingOpenAI();
    const openai = wrapOpenAI(client);

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [],
      stream: true,
    });
    let chunks = 0;
    for await (const _chunk of stream as AsyncIterable<unknown>) chunks++;
    expect(chunks).toBe(3);
    expect(collector.modelCalls).toHaveLength(0);
  });
});
