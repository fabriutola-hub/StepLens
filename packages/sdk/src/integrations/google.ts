/**
 * Google Gemini integration — `@agent-replay/sdk/integrations/google`.
 *
 * Wrap a Google GenAI client (`@google/genai`) so `models.generateContent`
 * calls made **inside** a `record()` run are recorded as model calls. Outside
 * a run, calls pass through untouched.
 *
 * `models.generateContentStream` is supported: you get back a transparent
 * async iterable; text is accumulated per chunk, the last `usageMetadata`
 * wins, and the call is recorded only once you have consumed the stream to
 * completion. We never drain a stream on your behalf.
 *
 * No dependency on the `@google/genai` package — uses structural types only.
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 * import { wrapGoogleGenAI } from "@agent-replay/sdk/integrations/google";
 * import { GoogleGenAI } from "@google/genai";
 *
 * const replay = createReplay();
 * const ai = wrapGoogleGenAI(new GoogleGenAI({}), { replay });
 *
 * await replay.record("Gemini Agent", async () => {
 *   await ai.models.generateContent({
 *     model: "gemini-2.0-flash",
 *     contents: "Say hello in one short sentence.",
 *   });
 * });
 * await replay.shutdown();
 * ```
 */
import type { ModelMessage, MessageRole } from "@agent-replay/core";
import { getRunContext, type RunContext } from "../context.js";
import type { Span } from "../span.js";
import type { Replay } from "../simple.js";
import { errInfo, isAsyncIterable } from "./shared.js";

export interface WrapGoogleGenAIOptions {
  /**
   * The {@link Replay} you're recording with. Reserved for clarity and future
   * use — recording is driven by the active `record()` context, so calls made
   * outside a run pass through regardless.
   */
  replay?: Replay;
}

// ── Structural shapes (no `@google/genai` types) ──────────────────────────────

interface GenerateContentArgs {
  model?: string;
  contents?: unknown;
  [k: string]: unknown;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  [k: string]: unknown;
}

interface GenerateContentResponse {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }>; role?: string };
  }>;
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
  [k: string]: unknown;
}

// ── Extraction helpers ─────────────────────────────────────────────────────────

/** Join the text parts of a response (or stream chunk). */
function extractText(res: GenerateContentResponse): string | undefined {
  if (typeof res.text === "string") return res.text;
  const parts = res.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const texts = parts
      .filter((p) => typeof p?.text === "string")
      .map((p) => p.text as string);
    if (texts.length > 0) return texts.join("");
  }
  return undefined;
}

/** Coerce Gemini `contents` into a prompt or messages. */
function requestInputs(contents: unknown): {
  prompt?: string;
  messages?: ModelMessage[];
} {
  if (typeof contents === "string") return { prompt: contents };
  if (Array.isArray(contents)) {
    const messages: ModelMessage[] = contents.map((item) => {
      if (typeof item === "string") return { role: "user", content: item };
      const entry = (item ?? {}) as {
        role?: string;
        parts?: Array<{ text?: string }>;
        text?: string;
      };
      const role: MessageRole =
        entry.role === "model" ? "assistant" : entry.role === "user" ? "user" : "user";
      const texts = Array.isArray(entry.parts)
        ? entry.parts.filter((p) => typeof p?.text === "string").map((p) => p.text as string)
        : [];
      const content =
        texts.length > 0
          ? texts.join("")
          : typeof entry.text === "string"
            ? entry.text
            : JSON.stringify(item);
      return { role, content };
    });
    return { messages };
  }
  if (contents !== undefined) return { prompt: JSON.stringify(contents) };
  return {};
}

/** Response metadata: model version, response id, and total token count. */
function responseMetadata(res: {
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
}): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (typeof res.modelVersion === "string") metadata.modelVersion = res.modelVersion;
  if (typeof res.responseId === "string") metadata.responseId = res.responseId;
  if (typeof res.usageMetadata?.totalTokenCount === "number") {
    metadata.totalTokenCount = res.usageMetadata.totalTokenCount;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

// ── Wrappers ───────────────────────────────────────────────────────────────────

type AnyFn = (...args: unknown[]) => unknown;

function recordResponse(opts: {
  ctx: RunContext;
  span: Span;
  args: GenerateContentArgs;
  model: string;
  response: string | undefined;
  usageMetadata: GeminiUsageMetadata | undefined;
  extra: { modelVersion?: string; responseId?: string };
  startedAt: number;
  streamed: boolean;
}): void {
  const { ctx, span, args, model, response, usageMetadata, extra, startedAt, streamed } = opts;
  const metadata = responseMetadata({ usageMetadata, ...extra });
  ctx.trace.recordModelCall({
    provider: "google",
    model,
    ...requestInputs(args.contents),
    response,
    inputTokens: usageMetadata?.promptTokenCount,
    outputTokens: usageMetadata?.candidatesTokenCount,
    spanId: span.id,
    startedAt,
    endedAt: Date.now(),
    metadata: streamed ? { ...metadata, streamed: true } : metadata,
  });
  span.end();
}

function recordFailure(opts: {
  ctx: RunContext;
  span: Span;
  args: GenerateContentArgs;
  model: string;
  startedAt: number;
  streamed: boolean;
  err: unknown;
}): void {
  const { ctx, span, args, model, startedAt, streamed, err } = opts;
  ctx.trace.recordModelCall({
    provider: "google",
    model,
    ...requestInputs(args.contents),
    spanId: span.id,
    startedAt,
    endedAt: Date.now(),
    metadata: { ...(streamed ? { streamed: true } : {}), error: errInfo(err) },
  });
  span.fail(err instanceof Error ? err : String(err));
}

function wrapGenerateContent(original: AnyFn): AnyFn {
  return async function wrapped(args: unknown, ...rest: unknown[]) {
    const ctx = getRunContext();
    if (!ctx) return original(args, ...rest);

    const a = (args && typeof args === "object" ? args : {}) as GenerateContentArgs;
    const model = typeof a.model === "string" ? a.model : "unknown";
    const span = ctx.trace.startSpan(model, { kind: "model", parentId: ctx.parentId });
    const startedAt = Date.now();

    try {
      const res = await original(args, ...rest);
      const r = (res ?? {}) as GenerateContentResponse;
      recordResponse({
        ctx,
        span,
        args: a,
        model,
        response: extractText(r),
        usageMetadata: r.usageMetadata,
        extra: { modelVersion: r.modelVersion, responseId: r.responseId },
        startedAt,
        streamed: false,
      });
      return res;
    } catch (err) {
      recordFailure({ ctx, span, args: a, model, startedAt, streamed: false, err });
      throw err;
    }
  };
}

function wrapGenerateContentStream(original: AnyFn): AnyFn {
  return async function wrapped(args: unknown, ...rest: unknown[]) {
    const ctx = getRunContext();
    if (!ctx) return original(args, ...rest);

    const a = (args && typeof args === "object" ? args : {}) as GenerateContentArgs;
    const model = typeof a.model === "string" ? a.model : "unknown";
    const span = ctx.trace.startSpan(model, { kind: "model", parentId: ctx.parentId });
    const startedAt = Date.now();

    let stream: unknown;
    try {
      stream = await original(args, ...rest);
    } catch (err) {
      recordFailure({ ctx, span, args: a, model, startedAt, streamed: true, err });
      throw err;
    }
    if (!isAsyncIterable(stream)) return stream;

    let recorded = false;
    let text = "";
    let usageMetadata: GeminiUsageMetadata | undefined;
    const extra: { modelVersion?: string; responseId?: string } = {};

    const accumulate = (chunk: unknown): void => {
      const c = (chunk ?? {}) as GenerateContentResponse;
      const t = extractText(c);
      if (t) text += t;
      // Keep the last usageMetadata seen — the final chunk carries the totals.
      if (c.usageMetadata) usageMetadata = c.usageMetadata;
      if (typeof c.modelVersion === "string") extra.modelVersion = c.modelVersion;
      if (typeof c.responseId === "string") extra.responseId = c.responseId;
    };

    const recordCompleted = (): void => {
      if (recorded) return;
      recorded = true;
      recordResponse({
        ctx,
        span,
        args: a,
        model,
        response: text || undefined,
        usageMetadata,
        extra,
        startedAt,
        streamed: true,
      });
    };

    const recordStreamFailure = (err: unknown): void => {
      if (recorded) return;
      recorded = true;
      recordFailure({ ctx, span, args: a, model, startedAt, streamed: true, err });
    };

    const target = stream as AsyncIterable<unknown> & Record<string | symbol, unknown>;
    return new Proxy(target, {
      get(t, prop) {
        if (prop === Symbol.asyncIterator) {
          return () => {
            const inner = t[Symbol.asyncIterator]();
            const iterator: AsyncIterator<unknown> & AsyncIterable<unknown> = {
              async next(...nextArgs: [] | [undefined]) {
                try {
                  const result = await inner.next(...nextArgs);
                  if (result.done) recordCompleted();
                  else accumulate(result.value);
                  return result;
                } catch (err) {
                  recordStreamFailure(err);
                  throw err;
                }
              },
              async return(value?: unknown) {
                // Consumer bailed early (break / return) — record nothing.
                return inner.return
                  ? inner.return(value)
                  : { done: true as const, value };
              },
              async throw(err?: unknown) {
                recordStreamFailure(err);
                if (inner.throw) return inner.throw(err);
                throw err;
              },
              [Symbol.asyncIterator]() {
                return this;
              },
            };
            return iterator;
          };
        }
        const value = t[prop];
        return typeof value === "function" ? (value as AnyFn).bind(t) : value;
      },
    });
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Wrap a Google GenAI client. Returns a transparent proxy: everything works
 * as before, but `models.generateContent` and `models.generateContentStream`
 * record model calls when invoked inside a `record()` run.
 */
export function wrapGoogleGenAI<T extends object>(
  client: T,
  _options?: WrapGoogleGenAIOptions,
): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];

      if (prop === "models" && value && typeof value === "object") {
        return new Proxy(value as object, {
          get(modelsTarget, modelsProp) {
            const inner = (modelsTarget as Record<string | symbol, unknown>)[modelsProp];
            if (modelsProp === "generateContent" && typeof inner === "function") {
              return wrapGenerateContent((inner as AnyFn).bind(modelsTarget));
            }
            if (modelsProp === "generateContentStream" && typeof inner === "function") {
              return wrapGenerateContentStream((inner as AnyFn).bind(modelsTarget));
            }
            return inner;
          },
        });
      }

      return value;
    },
  }) as T;
}
