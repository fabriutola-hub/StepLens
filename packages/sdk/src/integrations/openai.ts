/**
 * OpenAI integration — `@agent-replay/sdk/integrations/openai`.
 *
 * Wrap an OpenAI client so that `chat.completions.create` and `responses.create`
 * calls made **inside** a `record()` run are recorded as model calls. Outside a
 * run, calls pass through untouched.
 *
 * Streaming (`{ stream: true }`) is supported for both endpoints: the stream is
 * returned to you untouched and the model call is recorded only once you have
 * consumed it to completion. We never drain a stream on your behalf.
 *
 * No dependency on the `openai` package — uses structural types only.
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 * import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";
 * import OpenAI from "openai";
 *
 * const replay = createReplay();
 * const openai = wrapOpenAI(new OpenAI(), { replay });
 *
 * await replay.record("OpenAI Agent", async () => {
 *   await openai.chat.completions.create({
 *     model: "gpt-4o-mini",
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 * });
 * await replay.shutdown();
 * ```
 */
import type { ModelMessage, MessageRole } from "@agent-replay/core";
import { getRunContext, type RunContext } from "../context.js";
import type { Span } from "../span.js";
import type { Replay } from "../simple.js";

export interface WrapOpenAIOptions {
  /**
   * The {@link Replay} you're recording with. Reserved for clarity and future
   * use — recording is driven by the active `record()` context, so calls made
   * outside a run pass through regardless.
   */
  replay?: Replay;
}

// ── Structural response shapes (no `openai` types) ────────────────────────────

interface ChatCreateArgs {
  model?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
  [k: string]: unknown;
}
interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  [k: string]: unknown;
}
interface ResponsesCreateArgs {
  model?: string;
  input?: unknown;
  instructions?: string;
  [k: string]: unknown;
}
interface ResponsesResponse {
  output_text?: string;
  output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
  [k: string]: unknown;
}

/** A chunk of a `chat.completions.create({ stream: true })` stream. */
interface ChatStreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  [k: string]: unknown;
}
/** An event of a `responses.create({ stream: true })` stream. */
interface ResponsesStreamEvent {
  type?: string;
  delta?: unknown;
  response?: ResponsesResponse;
  [k: string]: unknown;
}

const KNOWN_ROLES = new Set<MessageRole>(["system", "user", "assistant", "tool"]);

function coerceMessages(
  messages: Array<{ role?: string; content?: unknown }> | undefined,
): ModelMessage[] | undefined {
  if (!Array.isArray(messages)) return undefined;
  return messages.map((m) => {
    const role = (m.role && KNOWN_ROLES.has(m.role as MessageRole)
      ? m.role
      : "user") as MessageRole;
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return { role, content };
  });
}

function errInfo(err: unknown): { name: string; message: string } {
  return err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: "Error", message: String(err) };
}

/** Pull text out of a `responses.create` result without the SDK's types. */
function extractResponsesText(res: ResponsesResponse): string | undefined {
  if (typeof res.output_text === "string") return res.output_text;
  // Fallback: scan output items for text content.
  const output = res.output as unknown;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const content = (item as { content?: unknown })?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = (c as { text?: unknown })?.text;
          if (typeof t === "string") parts.push(t);
        }
      }
    }
    if (parts.length) return parts.join("");
  }
  return undefined;
}

type AnyCreate = (args: unknown, ...rest: unknown[]) => Promise<unknown>;

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Record<symbol, unknown>)[Symbol.asyncIterator] === "function"
  );
}

/** Pull the request messages/prompt for either endpoint shape. */
function requestInputs(
  args: unknown,
  kind: "chat" | "responses",
): { prompt?: string; messages?: ModelMessage[] } {
  if (kind === "chat") {
    const a = (args ?? {}) as ChatCreateArgs;
    return { messages: coerceMessages(a.messages) };
  }
  const a = (args ?? {}) as ResponsesCreateArgs;
  return typeof a.input === "string"
    ? { prompt: a.input }
    : { messages: coerceMessages(a.input as Array<{ role?: string; content?: unknown }>) };
}

/**
 * Wrap a streaming result so the model call is recorded when (and only when)
 * the consumer iterates the stream to completion. We never drain the stream
 * ourselves; breaking out early records nothing.
 */
function wrapStream<S extends object>(
  stream: S,
  opts: {
    ctx: RunContext;
    span: Span;
    kind: "chat" | "responses";
    args: unknown;
    model: string;
    startedAt: number;
  },
): S {
  const { ctx, span, kind, args, model, startedAt } = opts;
  let recorded = false;
  let text = "";
  let usage: { input?: number; output?: number } = {};

  const accumulate = (chunk: unknown): void => {
    if (kind === "chat") {
      const c = (chunk ?? {}) as ChatStreamChunk;
      const delta = c.choices?.[0]?.delta?.content;
      if (typeof delta === "string") text += delta;
      if (c.usage) {
        usage = { input: c.usage.prompt_tokens, output: c.usage.completion_tokens };
      }
    } else {
      const e = (chunk ?? {}) as ResponsesStreamEvent;
      if (e.type === "response.output_text.delta" && typeof e.delta === "string") {
        text += e.delta;
      }
      if (e.type === "response.completed" && e.response) {
        const final = e.response;
        if (!text) text = extractResponsesText(final) ?? "";
        usage = { input: final.usage?.input_tokens, output: final.usage?.output_tokens };
      }
    }
  };

  const recordCompleted = (): void => {
    if (recorded) return;
    recorded = true;
    const { prompt, messages } = requestInputs(args, kind);
    ctx.trace.recordModelCall({
      provider: "openai",
      model,
      prompt,
      messages,
      response: text || undefined,
      inputTokens: usage.input,
      outputTokens: usage.output,
      spanId: span.id,
      startedAt,
      endedAt: Date.now(),
      metadata: { streamed: true },
    });
    span.end();
  };

  const recordFailed = (err: unknown): void => {
    if (recorded) return;
    recorded = true;
    ctx.trace.recordModelCall({
      provider: "openai",
      model,
      spanId: span.id,
      startedAt,
      endedAt: Date.now(),
      metadata: { streamed: true, error: errInfo(err) },
    });
    span.fail(err instanceof Error ? err : String(err));
  };

  return new Proxy(stream, {
    get(target, prop) {
      if (prop === Symbol.asyncIterator) {
        return () => {
          const inner = (target as AsyncIterable<unknown>)[Symbol.asyncIterator]();
          const iterator: AsyncIterator<unknown> & AsyncIterable<unknown> = {
            async next(...nextArgs: [] | [undefined]) {
              try {
                const result = await inner.next(...nextArgs);
                if (result.done) recordCompleted();
                else accumulate(result.value);
                return result;
              } catch (err) {
                recordFailed(err);
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
              recordFailed(err);
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
      const value = (target as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? (value as Function).bind(target) : value;
    },
  }) as S;
}

function wrapCreate(original: AnyCreate, kind: "chat" | "responses"): AnyCreate {
  return async function wrapped(args: unknown, ...rest: unknown[]) {
    const ctx = getRunContext();
    if (!ctx) {
      // Outside a record() run — pass through, record nothing.
      return original(args, ...rest);
    }

    const { trace, parentId } = ctx;
    const argObj =
      args && typeof args === "object"
        ? (args as { model?: unknown; stream?: unknown })
        : {};
    const model = typeof argObj.model === "string" ? argObj.model : "unknown";
    const span = trace.startSpan(model, { kind: "model", parentId });
    const startedAt = Date.now();

    try {
      const res = await original(args, ...rest);

      if (argObj.stream === true && isAsyncIterable(res)) {
        // Streaming: hand back a transparent wrapper that records once the
        // consumer finishes the stream. We never consume it ourselves.
        return wrapStream(res as object, { ctx, span, kind, args, model, startedAt });
      }

      const { prompt, messages } = requestInputs(args, kind);
      if (kind === "chat") {
        const r = (res ?? {}) as ChatResponse;
        trace.recordModelCall({
          provider: "openai",
          model,
          messages,
          response: r.choices?.[0]?.message?.content ?? undefined,
          inputTokens: r.usage?.prompt_tokens,
          outputTokens: r.usage?.completion_tokens,
          spanId: span.id,
          startedAt,
          endedAt: Date.now(),
        });
      } else {
        const r = (res ?? {}) as ResponsesResponse;
        trace.recordModelCall({
          provider: "openai",
          model,
          prompt,
          messages,
          response: extractResponsesText(r),
          inputTokens: r.usage?.input_tokens,
          outputTokens: r.usage?.output_tokens,
          spanId: span.id,
          startedAt,
          endedAt: Date.now(),
        });
      }
      span.end();
      return res;
    } catch (err) {
      trace.recordModelCall({
        provider: "openai",
        model,
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

function wrapResource(
  resource: object,
  wrapKey: string,
  kind: "chat" | "responses",
): object {
  return new Proxy(resource, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (prop === wrapKey && typeof value === "function") {
        return wrapCreate((value as Function).bind(target) as AnyCreate, kind);
      }
      return value;
    },
  });
}

/**
 * Wrap an OpenAI client. Returns a transparent proxy: everything works as
 * before, but `chat.completions.create` and `responses.create` record model
 * calls when invoked inside a `record()` run.
 */
export function wrapOpenAI<T extends object>(
  client: T,
  _options?: WrapOpenAIOptions,
): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];

      if (prop === "chat" && value && typeof value === "object") {
        // chat.completions.create
        return new Proxy(value as object, {
          get(chatTarget, chatProp) {
            const chatValue = (chatTarget as Record<string | symbol, unknown>)[chatProp];
            if (chatProp === "completions" && chatValue && typeof chatValue === "object") {
              return wrapResource(chatValue as object, "create", "chat");
            }
            return chatValue;
          },
        });
      }

      if (prop === "responses" && value && typeof value === "object") {
        return wrapResource(value as object, "create", "responses");
      }

      return value;
    },
  }) as T;
}
