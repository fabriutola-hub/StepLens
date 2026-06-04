/**
 * LangChain / LangGraph integration — `@agent-replay/sdk/integrations/langchain`.
 *
 * A callback handler that maps LangChain runs onto StepLens primitives:
 *
 * - chains / agents → spans (`agent` for root runs, `custom` for nested ones)
 * - retrievers      → `retrieval` spans
 * - tools           → spans + tool calls
 * - LLMs / chat models → spans + model calls (tokens from `llmOutput.tokenUsage`,
 *   `usage_metadata`, `response_metadata.tokenUsage`, or equivalents)
 *
 * `runId` / `parentRunId` preserve the hierarchy; `handle*Error` callbacks
 * record failures.
 *
 * Use it inside `replay.record()` (the active run context is picked up
 * automatically), or pass `{ replay, traceName }` to let the handler open its
 * own trace around the first root run:
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 * import { createLangChainCallbackHandler } from "@agent-replay/sdk/integrations/langchain";
 *
 * const replay = createReplay();
 * const handler = createLangChainCallbackHandler();
 *
 * await replay.record("LangChain Agent", async () => {
 *   await chain.invoke({ question: "..." }, { callbacks: [handler] });
 * });
 * await replay.shutdown();
 * ```
 *
 * No dependency on `langchain` / `@langchain/*` — uses structural types only.
 */
import type { ModelMessage, MessageRole, ModelProvider } from "@agent-replay/core";
import { getRunContext } from "../context.js";
import type { Span } from "../span.js";
import type { Trace } from "../trace.js";
import type { Replay } from "../simple.js";
import { KNOWN_ROLES, errInfo } from "./shared.js";

export interface LangChainCallbackHandlerOptions {
  /**
   * Open a trace automatically around the first root run (a run without a
   * `parentRunId`) when there is no active `record()` context. Requires
   * `traceName` as well. The trace ends (and the replay flushes) when that
   * root run completes or errors.
   */
  replay?: Replay;
  /** Name for the automatic trace. Requires `replay` as well. */
  traceName?: string;
}

/**
 * The handler shape LangChain accepts in `callbacks: [...]` (a plain
 * `CallbackHandlerMethods` object). All methods are own properties so they
 * survive LangChain's `BaseCallbackHandler.fromMethods` / `Object.assign`.
 */
export interface LangChainCallbackHandler {
  name: string;
  handleChainStart(
    chain: unknown,
    inputs: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
  ): void;
  handleChainEnd(outputs: unknown, runId: string): void | Promise<void>;
  handleChainError(err: unknown, runId: string): void | Promise<void>;
  handleLLMStart(
    llm: unknown,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void;
  handleChatModelStart(
    llm: unknown,
    messages: unknown[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void;
  handleLLMEnd(output: unknown, runId: string): void | Promise<void>;
  handleLLMError(err: unknown, runId: string): void | Promise<void>;
  handleToolStart(
    tool: unknown,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void;
  handleToolEnd(output: unknown, runId: string): void | Promise<void>;
  handleToolError(err: unknown, runId: string): void | Promise<void>;
  handleRetrieverStart(
    retriever: unknown,
    query: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    name?: string,
  ): void;
  handleRetrieverEnd(documents: unknown[], runId: string): void | Promise<void>;
  handleRetrieverError(err: unknown, runId: string): void | Promise<void>;
}

// ── Structural shapes (no `@langchain/core` types) ─────────────────────────────

interface SerializedLike {
  id?: unknown;
  name?: string;
  [k: string]: unknown;
}

interface LLMResultLike {
  generations?: Array<
    Array<{
      text?: string;
      message?: {
        content?: unknown;
        usage_metadata?: { input_tokens?: number; output_tokens?: number };
        response_metadata?: Record<string, unknown>;
      };
    }>
  >;
  llmOutput?: Record<string, unknown>;
}

interface RunEntry {
  trace: Trace;
  span: Span;
  kind: "chain" | "llm" | "tool" | "retrieval";
  startedAt: number;
  // llm extras
  provider?: ModelProvider;
  model?: string;
  prompt?: string;
  messages?: ModelMessage[];
  // tool extras
  toolName?: string;
  input?: unknown;
}

// ── Extraction helpers ─────────────────────────────────────────────────────────

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Last segment of a serialized component's `id` path (its class name). */
function idTail(serialized: unknown): string | undefined {
  const id = (serialized as SerializedLike | undefined)?.id;
  if (Array.isArray(id) && id.length > 0) return str(id[id.length - 1]);
  return str((serialized as SerializedLike | undefined)?.name);
}

/** Guess a provider from any hint string (class names, `ls_provider`, ids). */
function providerFromHint(hint: string | undefined): ModelProvider {
  if (!hint) return "custom";
  const h = hint.toLowerCase();
  if (h.includes("openai")) return "openai";
  if (h.includes("anthropic")) return "anthropic";
  if (h.includes("google") || h.includes("gemini") || h.includes("vertex")) return "google";
  if (h.includes("ollama")) return "ollama";
  return "custom";
}

/** Resolve provider/model for an LLM run from LangChain's start callback. */
function llmInfo(
  llm: unknown,
  extraParams: Record<string, unknown> | undefined,
  metadata: Record<string, unknown> | undefined,
  runName: string | undefined,
): { provider: ModelProvider; model: string } {
  const invocation = ((extraParams ?? {}) as { invocation_params?: Record<string, unknown> })
    .invocation_params;
  const model =
    str(metadata?.ls_model_name) ??
    str(invocation?.model) ??
    str(invocation?.model_name) ??
    str(invocation?.model_id) ??
    runName ??
    idTail(llm) ??
    "unknown";
  const id = (llm as SerializedLike | undefined)?.id;
  const hint =
    str(metadata?.ls_provider) ?? (Array.isArray(id) ? id.join("/") : idTail(llm)) ?? model;
  return { provider: providerFromHint(hint), model };
}

/** Coerce LangChain `BaseMessage[][]` into flat `ModelMessage[]`. */
function coerceLCMessages(groups: unknown): ModelMessage[] | undefined {
  if (!Array.isArray(groups)) return undefined;
  const out: ModelMessage[] = [];
  for (const m of groups.flat()) {
    const msg = m as {
      content?: unknown;
      _getType?: () => string;
      type?: string;
      role?: string;
    };
    const t =
      typeof msg?._getType === "function"
        ? msg._getType()
        : (str(msg?.type) ?? str(msg?.role) ?? "user");
    const role: MessageRole =
      t === "human"
        ? "user"
        : t === "ai"
          ? "assistant"
          : t === "function" || t === "tool"
            ? "tool"
            : KNOWN_ROLES.has(t as MessageRole)
              ? (t as MessageRole)
              : "user";
    const content = typeof msg?.content === "string" ? msg.content : JSON.stringify(msg?.content);
    out.push({ role, content });
  }
  return out.length > 0 ? out : undefined;
}

/** Pull response text and token usage out of an `LLMResult`. */
function extractLLMOutput(output: unknown): {
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
} {
  const result = (output ?? {}) as LLMResultLike;
  const generation = result.generations?.[0]?.[0];
  const text =
    str(generation?.text) ??
    (typeof generation?.message?.content === "string" ? generation.message.content : undefined);

  // Token usage lives in different places depending on the model package.
  const candidates: Array<{ input?: number; output?: number } | undefined> = [];
  const tokenUsage = result.llmOutput?.tokenUsage as
    | { promptTokens?: number; completionTokens?: number }
    | undefined;
  candidates.push(
    tokenUsage ? { input: tokenUsage.promptTokens, output: tokenUsage.completionTokens } : undefined,
  );
  const usageMetadata = generation?.message?.usage_metadata;
  candidates.push(
    usageMetadata
      ? { input: usageMetadata.input_tokens, output: usageMetadata.output_tokens }
      : undefined,
  );
  const responseTokenUsage = (generation?.message?.response_metadata as
    | { tokenUsage?: { promptTokens?: number; completionTokens?: number } }
    | undefined)?.tokenUsage;
  candidates.push(
    responseTokenUsage
      ? { input: responseTokenUsage.promptTokens, output: responseTokenUsage.completionTokens }
      : undefined,
  );
  const llmUsage = result.llmOutput?.usage as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  candidates.push(
    llmUsage ? { input: llmUsage.input_tokens, output: llmUsage.output_tokens } : undefined,
  );

  const usage = candidates.find((c) => c && (c.input != null || c.output != null));
  return { text, inputTokens: usage?.input, outputTokens: usage?.output };
}

// ── Handler factory ────────────────────────────────────────────────────────────

/**
 * Create a LangChain callback handler that records chains, tools, retrievers,
 * and LLM calls into StepLens. Pass it via `callbacks: [handler]` (per call or
 * on the constructor). Without an active `record()` run — and without the
 * `{ replay, traceName }` auto-trace option — callbacks are no-ops.
 */
export function createLangChainCallbackHandler(
  options: LangChainCallbackHandlerOptions = {},
): LangChainCallbackHandler {
  const entries = new Map<string, RunEntry>();
  let autoTrace: Trace | undefined;
  let autoRootRunId: string | undefined;

  /** Resolve where a new run should attach, opening the auto-trace if needed. */
  const resolveStart = (
    runId: string,
    parentRunId: string | undefined,
  ): { trace: Trace; parentSpanId?: string } | undefined => {
    if (parentRunId) {
      const parent = entries.get(parentRunId);
      if (parent) return { trace: parent.trace, parentSpanId: parent.span.id };
    }
    const ctx = getRunContext();
    if (ctx) return { trace: ctx.trace, parentSpanId: ctx.parentId };
    if (options.replay && options.traceName) {
      if (!autoTrace) {
        autoTrace = options.replay.client.startTrace(options.traceName);
        autoRootRunId = runId;
      }
      return { trace: autoTrace };
    }
    return undefined;
  };

  /** Close the auto-trace when its root run finishes. */
  const maybeEndAutoTrace = (
    runId: string,
    output?: unknown,
    err?: unknown,
  ): Promise<void> | undefined => {
    if (!autoTrace || runId !== autoRootRunId) return undefined;
    const trace = autoTrace;
    autoTrace = undefined;
    autoRootRunId = undefined;
    if (err !== undefined) trace.fail(err instanceof Error ? err : String(err));
    else trace.end(output);
    return options.replay?.flush();
  };

  const startRun = (
    runId: string,
    parentRunId: string | undefined,
    name: string,
    kind: RunEntry["kind"],
    spanKind: "agent" | "model" | "tool" | "retrieval" | "custom",
    extra?: Partial<RunEntry>,
  ): void => {
    const target = resolveStart(runId, parentRunId);
    if (!target) return;
    const span = target.trace.startSpan(name, {
      kind: spanKind,
      parentId: target.parentSpanId,
    });
    entries.set(runId, {
      trace: target.trace,
      span,
      kind,
      startedAt: Date.now(),
      ...extra,
    });
  };

  const takeRun = (runId: string): RunEntry | undefined => {
    const entry = entries.get(runId);
    if (entry) entries.delete(runId);
    return entry;
  };

  return {
    name: "agent-replay",

    // ── Chains / agents ──────────────────────────────────────────────────────
    handleChainStart(chain, _inputs, runId, parentRunId, _tags, _metadata, _runType, runName) {
      const name = runName ?? idTail(chain) ?? "chain";
      startRun(runId, parentRunId, name, "chain", parentRunId ? "custom" : "agent");
    },
    handleChainEnd(outputs, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      entry.span.end();
      return maybeEndAutoTrace(runId, outputs);
    },
    handleChainError(err, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      entry.span.fail(err instanceof Error ? err : String(err));
      return maybeEndAutoTrace(runId, undefined, err ?? "error");
    },

    // ── LLMs / chat models ───────────────────────────────────────────────────
    handleLLMStart(llm, prompts, runId, parentRunId, extraParams, _tags, metadata, runName) {
      const info = llmInfo(llm, extraParams, metadata, runName);
      startRun(runId, parentRunId, info.model, "llm", "model", {
        provider: info.provider,
        model: info.model,
        prompt: Array.isArray(prompts) ? prompts.join("\n") : undefined,
      });
    },
    handleChatModelStart(llm, messages, runId, parentRunId, extraParams, _tags, metadata, runName) {
      const info = llmInfo(llm, extraParams, metadata, runName);
      startRun(runId, parentRunId, info.model, "llm", "model", {
        provider: info.provider,
        model: info.model,
        messages: coerceLCMessages(messages),
      });
    },
    handleLLMEnd(output, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      const { text, inputTokens, outputTokens } = extractLLMOutput(output);
      entry.trace.recordModelCall({
        provider: entry.provider ?? "custom",
        model: entry.model ?? "unknown",
        prompt: entry.prompt,
        messages: entry.messages,
        response: text,
        inputTokens,
        outputTokens,
        spanId: entry.span.id,
        startedAt: entry.startedAt,
        endedAt: Date.now(),
      });
      entry.span.end();
      return maybeEndAutoTrace(runId, text);
    },
    handleLLMError(err, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      entry.trace.recordModelCall({
        provider: entry.provider ?? "custom",
        model: entry.model ?? "unknown",
        prompt: entry.prompt,
        messages: entry.messages,
        spanId: entry.span.id,
        startedAt: entry.startedAt,
        endedAt: Date.now(),
        metadata: { error: errInfo(err) },
      });
      entry.span.fail(err instanceof Error ? err : String(err));
      return maybeEndAutoTrace(runId, undefined, err ?? "error");
    },

    // ── Tools ────────────────────────────────────────────────────────────────
    handleToolStart(tool, input, runId, parentRunId, _tags, _metadata, runName) {
      const name = runName ?? idTail(tool) ?? "tool";
      startRun(runId, parentRunId, name, "tool", "tool", {
        toolName: name,
        input,
      });
    },
    handleToolEnd(output, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      entry.trace.recordToolCall({
        toolName: entry.toolName ?? "tool",
        input: entry.input,
        output,
        status: "success",
        spanId: entry.span.id,
      });
      entry.span.end();
      return maybeEndAutoTrace(runId, output);
    },
    handleToolError(err, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      entry.trace.recordToolCall({
        toolName: entry.toolName ?? "tool",
        input: entry.input,
        status: "error",
        spanId: entry.span.id,
        error: err instanceof Error ? err : String(err),
      });
      entry.span.fail(err instanceof Error ? err : String(err));
      return maybeEndAutoTrace(runId, undefined, err ?? "error");
    },

    // ── Retrievers ───────────────────────────────────────────────────────────
    handleRetrieverStart(retriever, query, runId, parentRunId, _tags, _metadata, name) {
      const spanName = name ?? idTail(retriever) ?? "retriever";
      startRun(runId, parentRunId, spanName, "retrieval", "retrieval", {
        input: query,
      });
    },
    handleRetrieverEnd(documents, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      if (typeof entry.input === "string") entry.span.setAttribute("query", entry.input);
      if (Array.isArray(documents)) entry.span.setAttribute("documents", documents.length);
      entry.span.end();
      return maybeEndAutoTrace(runId, undefined);
    },
    handleRetrieverError(err, runId) {
      const entry = takeRun(runId);
      if (!entry) return;
      entry.span.fail(err instanceof Error ? err : String(err));
      return maybeEndAutoTrace(runId, undefined, err ?? "error");
    },
  };
}
