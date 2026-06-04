/**
 * Vercel AI SDK integration — `@agent-replay/sdk/integrations/vercel-ai`.
 *
 * Wrap the AI SDK core functions so calls made **inside** a `record()` run are
 * recorded as model calls (and tool calls, when steps contain them). Outside a
 * run, calls pass through untouched.
 *
 * - `generateText` / `generateObject` are recorded when the result resolves.
 * - `streamText` / `streamObject` are recorded via `onFinish` / `onError`;
 *   your own callbacks are preserved and still called. Nothing is recorded if
 *   the stream is never consumed (the AI SDK only fires `onFinish` then).
 * - Multi-step calls (`steps` / `onStepFinish`) record one model call per step
 *   plus the step's tool calls.
 *
 * No dependency on the `ai` package — uses structural types only.
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 * import { wrapAISDK } from "@agent-replay/sdk/integrations/vercel-ai";
 * import { generateText, streamText } from "ai";
 *
 * const replay = createReplay();
 * const ai = wrapAISDK({ generateText, streamText }, { replay });
 *
 * await replay.record("AI SDK Agent", async () => {
 *   const { text } = await ai.generateText({
 *     model: "openai/gpt-4o-mini",
 *     prompt: "Say hello in one short sentence.",
 *   });
 * });
 * await replay.shutdown();
 * ```
 */
import type { ModelMessage, ModelProvider } from "@agent-replay/core";
import { getRunContext } from "../context.js";
import type { Span } from "../span.js";
import type { Trace } from "../trace.js";
import type { Replay } from "../simple.js";
import { coerceMessages, errInfo, providerFromName } from "./shared.js";

export interface WrapAISDKOptions {
  /**
   * The {@link Replay} you're recording with. Reserved for clarity and future
   * use — recording is driven by the active `record()` context, so calls made
   * outside a run pass through regardless.
   */
  replay?: Replay;
}

// ── Structural shapes (no `ai` types) ─────────────────────────────────────────

interface AISDKUsage {
  /** AI SDK 5.x names. */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** AI SDK 4.x names. */
  promptTokens?: number;
  completionTokens?: number;
}

interface AISDKToolCall {
  toolCallId?: string;
  toolName?: string;
  /** AI SDK 5.x */
  input?: unknown;
  /** AI SDK 4.x */
  args?: unknown;
}

interface AISDKToolResult {
  toolCallId?: string;
  toolName?: string;
  /** AI SDK 5.x */
  output?: unknown;
  /** AI SDK 4.x */
  result?: unknown;
}

interface AISDKStep {
  text?: string;
  usage?: AISDKUsage;
  finishReason?: string;
  toolCalls?: AISDKToolCall[];
  toolResults?: AISDKToolResult[];
  [k: string]: unknown;
}

interface AISDKResult extends AISDKStep {
  steps?: AISDKStep[];
  object?: unknown;
}

interface AISDKCallOptions {
  model?: unknown;
  prompt?: unknown;
  system?: unknown;
  messages?: Array<{ role?: string; content?: unknown }>;
  onStepFinish?: (step: AISDKStep) => unknown;
  onFinish?: (event: unknown) => unknown;
  onError?: (event: { error?: unknown }) => unknown;
  [k: string]: unknown;
}

type AnyFn = (...args: never[]) => unknown;
type AnyCall = (...args: unknown[]) => Promise<unknown> | unknown;

// ── Extraction helpers ─────────────────────────────────────────────────────────

/**
 * Resolve provider/model from an AI SDK `model` argument: either a gateway
 * string like `"openai/gpt-4o-mini"` or a language model object exposing
 * `provider` (e.g. `"openai.chat"`) and `modelId`.
 */
function extractModelInfo(model: unknown): { provider: ModelProvider; model: string } {
  if (typeof model === "string") {
    const idx = model.indexOf("/");
    if (idx > 0) {
      return { provider: providerFromName(model.slice(0, idx)), model: model.slice(idx + 1) };
    }
    return { provider: "custom", model };
  }
  if (model && typeof model === "object") {
    const m = model as { provider?: unknown; modelId?: unknown };
    return {
      provider: providerFromName(typeof m.provider === "string" ? m.provider : undefined),
      model: typeof m.modelId === "string" ? m.modelId : "unknown",
    };
  }
  return { provider: "custom", model: "unknown" };
}

/** Pull the request prompt/messages (folding `system` in when present). */
function requestInputs(options: AISDKCallOptions): {
  prompt?: string;
  messages?: ModelMessage[];
} {
  const messages = coerceMessages(options.messages);
  const system = typeof options.system === "string" ? options.system : undefined;
  if (messages) {
    return {
      messages: system ? [{ role: "system", content: system }, ...messages] : messages,
    };
  }
  const prompt = typeof options.prompt === "string" ? options.prompt : undefined;
  if (system && prompt) {
    return {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    };
  }
  return { prompt };
}

function usageTokens(u: AISDKUsage | undefined): { input?: number; output?: number } {
  return {
    input: u?.inputTokens ?? u?.promptTokens,
    output: u?.outputTokens ?? u?.completionTokens,
  };
}

// ── Per-call recorder ──────────────────────────────────────────────────────────

interface CallRecorder {
  /** Record one finished step (model call + its tool calls). */
  recordStep(step: AISDKStep): void;
  /** Close out the call from its final result; no-op if already finished. */
  finishFromResult(result: AISDKResult | undefined): void;
  /** Close out the call as failed; no-op if already finished. */
  fail(err: unknown): void;
}

function createCallRecorder(opts: {
  trace: Trace;
  span: Span;
  info: { provider: ModelProvider; model: string };
  inputs: { prompt?: string; messages?: ModelMessage[] };
  startedAt: number;
  streamed: boolean;
}): CallRecorder {
  const { trace, span, info, inputs, startedAt, streamed } = opts;
  let stepCount = 0;
  let finished = false;

  const recordTools = (step: AISDKStep): void => {
    const resultsById = new Map(
      (step.toolResults ?? [])
        .filter((r) => r.toolCallId != null)
        .map((r) => [r.toolCallId, r] as const),
    );
    for (const tc of step.toolCalls ?? []) {
      const match = tc.toolCallId != null ? resultsById.get(tc.toolCallId) : undefined;
      trace.recordToolCall({
        toolName: tc.toolName ?? "tool",
        input: tc.input ?? tc.args,
        output: match ? (match.output ?? match.result) : undefined,
        status: "success",
        spanId: span.id,
      });
    }
  };

  const record = (step: AISDKStep, timestamps?: { startedAt: number; endedAt: number }): void => {
    const { input, output } = usageTokens(step.usage);
    trace.recordModelCall({
      provider: info.provider,
      model: info.model,
      // Attach the original request inputs to the first step only.
      ...(stepCount === 0 ? inputs : {}),
      response: step.text || undefined,
      inputTokens: input,
      outputTokens: output,
      spanId: span.id,
      ...timestamps,
      metadata: {
        ...(streamed ? { streamed: true } : {}),
        ...(step.finishReason ? { finishReason: step.finishReason } : {}),
        step: stepCount,
      },
    });
    recordTools(step);
    stepCount++;
  };

  return {
    recordStep(step) {
      record(step);
    },
    finishFromResult(result) {
      if (finished) return;
      finished = true;
      if (stepCount === 0) {
        const steps =
          Array.isArray(result?.steps) && result.steps.length > 0
            ? result.steps
            : [result ?? {}];
        const endedAt = Date.now();
        for (const step of steps) {
          record(step, steps.length === 1 ? { startedAt, endedAt } : undefined);
        }
      }
      span.end();
    },
    fail(err) {
      if (finished) return;
      finished = true;
      trace.recordModelCall({
        provider: info.provider,
        model: info.model,
        ...(stepCount === 0 ? inputs : {}),
        spanId: span.id,
        startedAt,
        endedAt: Date.now(),
        metadata: {
          ...(streamed ? { streamed: true } : {}),
          error: errInfo(err),
        },
      });
      span.fail(err instanceof Error ? err : String(err));
    },
  };
}

function setup(options: AISDKCallOptions, streamed: boolean): CallRecorder | undefined {
  const ctx = getRunContext();
  if (!ctx) return undefined;
  const info = extractModelInfo(options.model);
  const span = ctx.trace.startSpan(info.model, { kind: "model", parentId: ctx.parentId });
  return createCallRecorder({
    trace: ctx.trace,
    span,
    info,
    inputs: requestInputs(options),
    startedAt: Date.now(),
    streamed,
  });
}

// ── Wrappers ───────────────────────────────────────────────────────────────────

function wrapGenerateText<F extends AnyFn>(fn: F): F {
  const wrapped = async (options: unknown, ...rest: unknown[]) => {
    const opts = (options ?? {}) as AISDKCallOptions;
    const recorder = setup(opts, false);
    if (!recorder) return (fn as unknown as AnyCall)(options, ...rest);

    const userOnStepFinish = opts.onStepFinish;
    const patched: AISDKCallOptions = {
      ...opts,
      onStepFinish: async (step: AISDKStep) => {
        recorder.recordStep(step);
        if (typeof userOnStepFinish === "function") await userOnStepFinish(step);
      },
    };
    try {
      const result = await (fn as unknown as AnyCall)(patched, ...rest);
      recorder.finishFromResult(result as AISDKResult);
      return result;
    } catch (err) {
      recorder.fail(err);
      throw err;
    }
  };
  return wrapped as unknown as F;
}

function wrapGenerateObject<F extends AnyFn>(fn: F): F {
  const wrapped = async (options: unknown, ...rest: unknown[]) => {
    const opts = (options ?? {}) as AISDKCallOptions;
    const recorder = setup(opts, false);
    if (!recorder) return (fn as unknown as AnyCall)(options, ...rest);
    try {
      const result = await (fn as unknown as AnyCall)(options, ...rest);
      const r = (result ?? {}) as AISDKResult;
      recorder.finishFromResult({
        text: r.object !== undefined ? JSON.stringify(r.object) : r.text,
        usage: r.usage,
        finishReason: r.finishReason,
      });
      return result;
    } catch (err) {
      recorder.fail(err);
      throw err;
    }
  };
  return wrapped as unknown as F;
}

function wrapStreamText<F extends AnyFn>(fn: F): F {
  const wrapped = (options: unknown, ...rest: unknown[]) => {
    const opts = (options ?? {}) as AISDKCallOptions;
    const recorder = setup(opts, true);
    if (!recorder) return (fn as unknown as AnyCall)(options, ...rest);

    const userOnStepFinish = opts.onStepFinish;
    const userOnFinish = opts.onFinish;
    const userOnError = opts.onError;
    const patched: AISDKCallOptions = {
      ...opts,
      onStepFinish: async (step: AISDKStep) => {
        recorder.recordStep(step);
        if (typeof userOnStepFinish === "function") await userOnStepFinish(step);
      },
      onFinish: async (event: unknown) => {
        recorder.finishFromResult(event as AISDKResult);
        if (typeof userOnFinish === "function") await userOnFinish(event);
      },
      onError: async (event: { error?: unknown }) => {
        recorder.fail(event?.error ?? event);
        if (typeof userOnError === "function") await userOnError(event);
      },
    };
    try {
      return (fn as unknown as AnyCall)(patched, ...rest);
    } catch (err) {
      recorder.fail(err);
      throw err;
    }
  };
  return wrapped as unknown as F;
}

function wrapStreamObject<F extends AnyFn>(fn: F): F {
  const wrapped = (options: unknown, ...rest: unknown[]) => {
    const opts = (options ?? {}) as AISDKCallOptions;
    const recorder = setup(opts, true);
    if (!recorder) return (fn as unknown as AnyCall)(options, ...rest);

    const userOnFinish = opts.onFinish;
    const userOnError = opts.onError;
    const patched: AISDKCallOptions = {
      ...opts,
      onFinish: async (event: unknown) => {
        const e = (event ?? {}) as AISDKResult & { error?: unknown };
        if (e.error !== undefined) {
          recorder.fail(e.error);
        } else {
          recorder.finishFromResult({
            text: e.object !== undefined ? JSON.stringify(e.object) : e.text,
            usage: e.usage,
          });
        }
        if (typeof userOnFinish === "function") await userOnFinish(event);
      },
      onError: async (event: { error?: unknown }) => {
        recorder.fail(event?.error ?? event);
        if (typeof userOnError === "function") await userOnError(event);
      },
    };
    try {
      return (fn as unknown as AnyCall)(patched, ...rest);
    } catch (err) {
      recorder.fail(err);
      throw err;
    }
  };
  return wrapped as unknown as F;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface AISDKFunctions {
  generateText?: AnyFn;
  streamText?: AnyFn;
  generateObject?: AnyFn;
  streamObject?: AnyFn;
}

/**
 * Wrap the AI SDK core functions you use. Pass the real functions from the
 * `ai` package; you get back the same functions, instrumented. Calls made
 * outside a `record()` run pass through untouched.
 */
export function wrapAISDK<T extends AISDKFunctions>(fns: T, _options?: WrapAISDKOptions): T {
  const out: AISDKFunctions = { ...fns };
  if (typeof fns.generateText === "function") out.generateText = wrapGenerateText(fns.generateText);
  if (typeof fns.streamText === "function") out.streamText = wrapStreamText(fns.streamText);
  if (typeof fns.generateObject === "function") out.generateObject = wrapGenerateObject(fns.generateObject);
  if (typeof fns.streamObject === "function") out.streamObject = wrapStreamObject(fns.streamObject);
  return out as T;
}
