/**
 * Anthropic integration — `@agent-replay/sdk/integrations/anthropic`.
 *
 * Wrap an Anthropic client so `messages.create` calls made **inside** a
 * `record()` run are recorded as model calls. Outside a run, calls pass
 * through untouched.
 *
 * Streaming via `messages.stream(...)` is supported by wrapping
 * `finalMessage()`: the call is recorded only when you call (and await)
 * `finalMessage()`. Iterating events yourself works as before but records
 * nothing — we never consume a stream on your behalf. `messages.create` with
 * `{ stream: true }` (the raw event stream) also passes through unrecorded.
 *
 * No dependency on the `@anthropic-ai/sdk` package — uses structural types only.
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 * import { wrapAnthropic } from "@agent-replay/sdk/integrations/anthropic";
 * import Anthropic from "@anthropic-ai/sdk";
 *
 * const replay = createReplay();
 * const anthropic = wrapAnthropic(new Anthropic(), { replay });
 *
 * await replay.record("Anthropic Agent", async () => {
 *   await anthropic.messages.create({
 *     model: "claude-3-5-haiku-20241022",
 *     max_tokens: 256,
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 * });
 * await replay.shutdown();
 * ```
 */
import type { ModelMessage } from "@agent-replay/core";
import { getRunContext, type RunContext } from "../context.js";
import type { Span } from "../span.js";
import type { Replay } from "../simple.js";
import { coerceMessages, errInfo } from "./shared.js";

export interface WrapAnthropicOptions {
  /**
   * The {@link Replay} you're recording with. Reserved for clarity and future
   * use — recording is driven by the active `record()` context, so calls made
   * outside a run pass through regardless.
   */
  replay?: Replay;
}

// ── Structural shapes (no `@anthropic-ai/sdk` types) ──────────────────────────

interface MessagesCreateArgs {
  model?: string;
  system?: unknown;
  messages?: Array<{ role?: string; content?: unknown }>;
  stream?: boolean;
  [k: string]: unknown;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface AnthropicMessage {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
  [k: string]: unknown;
}

/** What we need from a `messages.stream(...)` result. */
interface MessageStreamLike {
  finalMessage?: (...args: unknown[]) => Promise<unknown>;
  [k: string]: unknown;
}

// ── Extraction helpers ─────────────────────────────────────────────────────────

/** Join the text blocks of a message's content. */
function extractText(message: AnthropicMessage): string | undefined {
  if (!Array.isArray(message.content)) return undefined;
  const parts = message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string);
  return parts.length > 0 ? parts.join("") : undefined;
}

/** Request messages, folding a string `system` prompt in when present. */
function requestMessages(args: MessagesCreateArgs): ModelMessage[] | undefined {
  const messages = coerceMessages(args.messages);
  if (!messages) return undefined;
  return typeof args.system === "string"
    ? [{ role: "system", content: args.system }, ...messages]
    : messages;
}

/** Response metadata: stop reason, message id, and cache tokens when present. */
function responseMetadata(message: AnthropicMessage): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (typeof message.stop_reason === "string") metadata.stop_reason = message.stop_reason;
  if (typeof message.id === "string") metadata.id = message.id;
  const cacheCreation = message.usage?.cache_creation_input_tokens;
  if (typeof cacheCreation === "number") metadata.cache_creation_input_tokens = cacheCreation;
  const cacheRead = message.usage?.cache_read_input_tokens;
  if (typeof cacheRead === "number") metadata.cache_read_input_tokens = cacheRead;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function recordMessage(opts: {
  ctx: RunContext;
  span: Span;
  args: MessagesCreateArgs;
  model: string;
  message: AnthropicMessage;
  startedAt: number;
  streamed: boolean;
}): void {
  const { ctx, span, args, model, message, startedAt, streamed } = opts;
  const metadata = responseMetadata(message);
  ctx.trace.recordModelCall({
    provider: "anthropic",
    model: typeof message.model === "string" ? message.model : model,
    messages: requestMessages(args),
    response: extractText(message),
    inputTokens: message.usage?.input_tokens,
    outputTokens: message.usage?.output_tokens,
    spanId: span.id,
    startedAt,
    endedAt: Date.now(),
    metadata: streamed ? { ...metadata, streamed: true } : metadata,
  });
  span.end();
}

// ── Wrappers ───────────────────────────────────────────────────────────────────

type AnyFn = (...args: unknown[]) => unknown;

function wrapMessagesCreate(original: AnyFn): AnyFn {
  return async function wrapped(args: unknown, ...rest: unknown[]) {
    const ctx = getRunContext();
    const a = (args && typeof args === "object" ? args : {}) as MessagesCreateArgs;
    if (!ctx || a.stream === true) {
      // Outside a record() run, or a raw event stream (use `messages.stream`
      // + `finalMessage()` to record streaming) — pass through untouched.
      return original(args, ...rest);
    }

    const { trace, parentId } = ctx;
    const model = typeof a.model === "string" ? a.model : "unknown";
    const span = trace.startSpan(model, { kind: "model", parentId });
    const startedAt = Date.now();

    try {
      const res = await original(args, ...rest);
      recordMessage({
        ctx,
        span,
        args: a,
        model,
        message: (res ?? {}) as AnthropicMessage,
        startedAt,
        streamed: false,
      });
      return res;
    } catch (err) {
      trace.recordModelCall({
        provider: "anthropic",
        model,
        messages: requestMessages(a),
        spanId: span.id,
        startedAt,
        endedAt: Date.now(),
        metadata: { error: errInfo(err) },
      });
      span.fail(err instanceof Error ? err : String(err));
      throw err;
    }
  };
}

function wrapMessagesStream(original: AnyFn): AnyFn {
  return function wrapped(args: unknown, ...rest: unknown[]) {
    const ctx = getRunContext();
    if (!ctx) return original(args, ...rest);

    const { trace, parentId } = ctx;
    const a = (args && typeof args === "object" ? args : {}) as MessagesCreateArgs;
    const model = typeof a.model === "string" ? a.model : "unknown";
    const span = trace.startSpan(model, { kind: "model", parentId });
    const startedAt = Date.now();
    let recorded = false;

    const stream = original(args, ...rest);
    if (!stream || typeof stream !== "object") return stream;

    return new Proxy(stream as MessageStreamLike, {
      get(target, prop) {
        const value = (target as Record<string | symbol, unknown>)[prop];
        if (prop === "finalMessage" && typeof value === "function") {
          return async (...fmArgs: unknown[]) => {
            try {
              const message = await (value as AnyFn).apply(target, fmArgs);
              if (!recorded) {
                recorded = true;
                recordMessage({
                  ctx,
                  span,
                  args: a,
                  model,
                  message: (message ?? {}) as AnthropicMessage,
                  startedAt,
                  streamed: true,
                });
              }
              return message;
            } catch (err) {
              if (!recorded) {
                recorded = true;
                trace.recordModelCall({
                  provider: "anthropic",
                  model,
                  messages: requestMessages(a),
                  spanId: span.id,
                  startedAt,
                  endedAt: Date.now(),
                  metadata: { streamed: true, error: errInfo(err) },
                });
                span.fail(err instanceof Error ? err : String(err));
              }
              throw err;
            }
          };
        }
        return typeof value === "function" ? (value as AnyFn).bind(target) : value;
      },
    });
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Wrap an Anthropic client. Returns a transparent proxy: everything works as
 * before, but `messages.create` records a model call when invoked inside a
 * `record()` run, and `messages.stream(...).finalMessage()` records the call
 * when the final message resolves.
 */
export function wrapAnthropic<T extends object>(
  client: T,
  _options?: WrapAnthropicOptions,
): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];

      if (prop === "messages" && value && typeof value === "object") {
        return new Proxy(value as object, {
          get(messagesTarget, messagesProp) {
            const inner = (messagesTarget as Record<string | symbol, unknown>)[messagesProp];
            if (messagesProp === "create" && typeof inner === "function") {
              return wrapMessagesCreate((inner as AnyFn).bind(messagesTarget));
            }
            if (messagesProp === "stream" && typeof inner === "function") {
              return wrapMessagesStream((inner as AnyFn).bind(messagesTarget));
            }
            return inner;
          },
        });
      }

      return value;
    },
  }) as T;
}
