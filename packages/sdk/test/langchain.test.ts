import { describe, it, expect } from "vitest";
import { MemoryCollector } from "../src/index.js";
import { createReplay } from "../src/simple.js";
import { createLangChainCallbackHandler } from "../src/integrations/langchain.js";

const CHAT_OPENAI_ID = ["langchain", "chat_models", "openai", "ChatOpenAI"];

describe("createLangChainCallbackHandler", () => {
  it("maps a chain with an LLM, a tool, and a retriever, preserving hierarchy", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const handler = createLangChainCallbackHandler();

    await replay.record("LangChain Agent", async () => {
      handler.handleChainStart(
        { id: ["langchain", "chains", "LLMChain"] },
        { question: "What is StepLens?" },
        "run-1",
        undefined,
        [],
        {},
        undefined,
        "MyChain",
      );
      handler.handleChatModelStart(
        { id: CHAT_OPENAI_ID },
        [[{ _getType: () => "human", content: "Hello" }]],
        "run-2",
        "run-1",
        { invocation_params: { model: "gpt-4o-mini" } },
        [],
        { ls_provider: "openai", ls_model_name: "gpt-4o-mini" },
      );
      handler.handleLLMEnd(
        {
          generations: [[{ text: "Hi!" }]],
          llmOutput: { tokenUsage: { promptTokens: 11, completionTokens: 6 } },
        },
        "run-2",
      );
      handler.handleToolStart(
        { id: ["langchain", "tools", "Calculator"] },
        "2+2",
        "run-3",
        "run-1",
      );
      handler.handleToolEnd("4", "run-3");
      handler.handleRetrieverStart(
        { id: ["langchain", "retrievers", "VectorStoreRetriever"] },
        "docs about x",
        "run-4",
        "run-1",
      );
      handler.handleRetrieverEnd([{}, {}], "run-4");
      handler.handleChainEnd({ answer: "Hi!" }, "run-1");
    });

    // Spans: chain (agent), model, tool, retrieval — children of the chain span.
    expect(collector.spans).toHaveLength(4);
    const chainSpan = collector.spans.find((s) => s.name === "MyChain");
    expect(chainSpan?.kind).toBe("agent");
    expect(chainSpan?.status).toBe("success");
    const modelSpan = collector.spans.find((s) => s.kind === "model");
    expect(modelSpan?.parentId).toBe(chainSpan?.id);
    const toolSpan = collector.spans.find((s) => s.kind === "tool");
    expect(toolSpan?.parentId).toBe(chainSpan?.id);
    const retrievalSpan = collector.spans.find((s) => s.kind === "retrieval");
    expect(retrievalSpan?.parentId).toBe(chainSpan?.id);
    expect(retrievalSpan?.attributes?.documents).toBe(2);

    // Model call with tokens from llmOutput.tokenUsage.
    expect(collector.modelCalls).toHaveLength(1);
    const mc = collector.modelCalls[0];
    expect(mc.provider).toBe("openai");
    expect(mc.model).toBe("gpt-4o-mini");
    expect(mc.response).toBe("Hi!");
    expect(mc.inputTokens).toBe(11);
    expect(mc.outputTokens).toBe(6);
    expect(mc.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(mc.spanId).toBe(modelSpan?.id);
    expect(mc.endedAt).toBeGreaterThanOrEqual(mc.startedAt);

    // Tool call attached to the tool span.
    expect(collector.toolCalls).toHaveLength(1);
    const tc = collector.toolCalls[0];
    expect(tc.toolName).toBe("Calculator");
    expect(tc.input).toBe("2+2");
    expect(tc.output).toBe("4");
    expect(tc.spanId).toBe(toolSpan?.id);
  });

  it("nested chains keep the runId/parentRunId hierarchy", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const handler = createLangChainCallbackHandler();

    await replay.record("Nested", async () => {
      handler.handleChainStart({}, {}, "root", undefined, [], {}, undefined, "Outer");
      handler.handleChainStart({}, {}, "child", "root", [], {}, undefined, "Inner");
      handler.handleChainEnd({}, "child");
      handler.handleChainEnd({}, "root");
    });

    const outer = collector.spans.find((s) => s.name === "Outer");
    const inner = collector.spans.find((s) => s.name === "Inner");
    expect(outer?.kind).toBe("agent");
    expect(inner?.kind).toBe("custom");
    expect(inner?.parentId).toBe(outer?.id);
  });

  it("captures tokens from usage_metadata and response_metadata.tokenUsage fallbacks", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const handler = createLangChainCallbackHandler();

    await replay.record("Token fallbacks", async () => {
      // usage_metadata on the generation message
      handler.handleChatModelStart({ id: CHAT_OPENAI_ID }, [[]], "run-a", undefined);
      handler.handleLLMEnd(
        {
          generations: [
            [{ message: { content: "A", usage_metadata: { input_tokens: 3, output_tokens: 1 } } }],
          ],
        },
        "run-a",
      );
      // response_metadata.tokenUsage on the generation message
      handler.handleChatModelStart({ id: CHAT_OPENAI_ID }, [[]], "run-b", undefined);
      handler.handleLLMEnd(
        {
          generations: [
            [
              {
                message: {
                  content: "B",
                  response_metadata: { tokenUsage: { promptTokens: 7, completionTokens: 2 } },
                },
              },
            ],
          ],
        },
        "run-b",
      );
    });

    expect(collector.modelCalls).toHaveLength(2);
    expect(collector.modelCalls[0].inputTokens).toBe(3);
    expect(collector.modelCalls[0].outputTokens).toBe(1);
    expect(collector.modelCalls[0].response).toBe("A");
    expect(collector.modelCalls[1].inputTokens).toBe(7);
    expect(collector.modelCalls[1].outputTokens).toBe(2);
  });

  it("records LLM, tool, and chain errors", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const handler = createLangChainCallbackHandler();

    await replay.record("Errors", async () => {
      handler.handleChainStart({}, {}, "run-1", undefined, [], {}, undefined, "Chain");
      handler.handleLLMStart({ id: CHAT_OPENAI_ID }, ["prompt"], "run-2", "run-1", {
        invocation_params: { model: "gpt-4o-mini" },
      });
      handler.handleLLMError(new Error("rate limited"), "run-2");
      handler.handleToolStart({ id: ["langchain", "tools", "Search"] }, "query", "run-3", "run-1");
      handler.handleToolError(new Error("tool down"), "run-3");
      handler.handleChainError(new Error("chain failed"), "run-1");
    });

    expect(collector.modelCalls).toHaveLength(1);
    expect(collector.modelCalls[0].prompt).toBe("prompt");
    expect(
      (collector.modelCalls[0].metadata?.error as { message?: string })?.message,
    ).toBe("rate limited");

    expect(collector.toolCalls).toHaveLength(1);
    expect(collector.toolCalls[0].status).toBe("error");
    expect(collector.toolCalls[0].error?.message).toBe("tool down");

    const chainSpan = collector.spans.find((s) => s.name === "Chain");
    expect(chainSpan?.status).toBe("error");
  });

  it("does nothing outside record() without the auto-trace option", async () => {
    const collector = new MemoryCollector();
    createReplay({ collector });
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart({}, {}, "run-1", undefined, [], {}, undefined, "Chain");
    handler.handleChainEnd({}, "run-1");

    expect(collector.spans).toHaveLength(0);
    expect(collector.traces).toHaveLength(0);
  });

  it("opens an automatic trace with { replay, traceName } and ends it with the root run", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const handler = createLangChainCallbackHandler({ replay, traceName: "Auto LC Trace" });

    handler.handleChainStart({}, { q: 1 }, "root", undefined, [], {}, undefined, "Root");
    handler.handleChatModelStart({ id: CHAT_OPENAI_ID }, [[]], "llm", "root", {
      invocation_params: { model: "gpt-4o-mini" },
    });
    handler.handleLLMEnd(
      { generations: [[{ text: "done" }]], llmOutput: { tokenUsage: { promptTokens: 1, completionTokens: 1 } } },
      "llm",
    );
    await handler.handleChainEnd({ answer: "done" }, "root");

    expect(collector.traces).toHaveLength(1);
    expect(collector.traces[0].name).toBe("Auto LC Trace");
    expect(collector.traces[0].status).toBe("success");
    expect(collector.modelCalls).toHaveLength(1);
    const rootSpan = collector.spans.find((s) => s.name === "Root");
    expect(rootSpan?.traceId).toBe(collector.traces[0].id);
  });

  it("survives LangChain's fromMethods-style Object.assign copying", async () => {
    const collector = new MemoryCollector();
    const replay = createReplay({ collector });
    const handler = createLangChainCallbackHandler();
    // LangChain wraps plain handler objects via Object.assign onto a new
    // instance — methods must be own properties for this to work.
    const copied = Object.assign({ lc_extra: true }, handler);

    await replay.record("Copied", async () => {
      copied.handleChainStart({}, {}, "run-1", undefined, [], {}, undefined, "Chain");
      copied.handleChainEnd({}, "run-1");
    });

    expect(collector.spans).toHaveLength(1);
    expect(collector.spans[0].status).toBe("success");
  });
});
