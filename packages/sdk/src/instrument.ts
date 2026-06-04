import type { SpanKind, ModelProvider, ModelMessage } from "@agent-replay/core";
import type { Trace } from "./trace.js";
import type { Span } from "./span.js";

// ── withSpan ─────────────────────────────────────────────────────────────────

/**
 * Run an async function inside a span. Automatically starts the span,
 * captures timing, and ends it on completion or failure.
 *
 * @example
 * ```ts
 * const result = await withSpan(trace, "search", { kind: "tool" }, async (span) => {
 *   span.setAttribute("query", "OpenTelemetry");
 *   return await searchDocs("OpenTelemetry");
 * });
 * ```
 */
export async function withSpan<T>(
  trace: Trace,
  name: string,
  optionsOrFn:
    | { kind?: SpanKind; attributes?: Record<string, unknown> }
    | ((span: Span) => Promise<T>),
  fn?: (span: Span) => Promise<T>,
): Promise<T> {
  // Support both `withSpan(trace, name, fn)` and `withSpan(trace, name, options, fn)`
  const options =
    typeof optionsOrFn === "function" ? {} : optionsOrFn;
  const handler =
    typeof optionsOrFn === "function" ? optionsOrFn : fn!;

  const span = trace.startSpan(name, options);
  try {
    const result = await handler(span);
    span.end();
    return result;
  } catch (error) {
    span.fail(error instanceof Error ? error : String(error));
    throw error;
  }
}

// ── withModelCall ────────────────────────────────────────────────────────────

export interface ModelCallOptions {
  provider: ModelProvider;
  model: string;
  prompt?: string;
  messages?: ModelMessage[];
  spanId?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelCallResult {
  response?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Wrap an async model call. Automatically records the call, captures
 * timing, token usage, and estimates cost.
 *
 * @example
 * ```ts
 * const result = await withModelCall(trace, {
 *   provider: "openai",
 *   model: "gpt-4o",
 *   messages: [{ role: "user", content: "Hello" }],
 * }, async () => {
 *   const resp = await openai.chat.completions.create({ ... });
 *   return {
 *     response: resp.choices[0].message.content,
 *     inputTokens: resp.usage.prompt_tokens,
 *     outputTokens: resp.usage.completion_tokens,
 *   };
 * });
 * ```
 */
export async function withModelCall(
  trace: Trace,
  options: ModelCallOptions,
  fn: () => Promise<ModelCallResult>,
): Promise<ModelCallResult> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    trace.recordModelCall({
      ...options,
      response: result.response,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    return result;
  } catch (error) {
    // Record the failed call with what we know
    trace.recordModelCall({
      ...options,
      metadata: {
        ...options.metadata,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
        durationMs: Date.now() - startedAt,
      },
    });
    throw error;
  }
}

// ── withToolCall ─────────────────────────────────────────────────────────────

export interface ToolCallOptions {
  toolName: string;
  input: unknown;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Wrap an async tool call. Automatically records the call, captures
 * timing, input/output, and errors.
 *
 * @example
 * ```ts
 * const result = await withToolCall(trace, {
 *   toolName: "web_search",
 *   input: { query: "OpenTelemetry" },
 * }, async () => {
 *   return await webSearch("OpenTelemetry");
 * });
 * ```
 */
export async function withToolCall<T>(
  trace: Trace,
  options: ToolCallOptions,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const output = await fn();
    trace.recordToolCall({
      ...options,
      output,
      status: "success",
    });
    return output;
  } catch (error) {
    trace.recordToolCall({
      ...options,
      status: "error",
      error: error instanceof Error ? error : String(error),
    });
    throw error;
  }
}
