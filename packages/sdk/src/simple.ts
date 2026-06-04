/**
 * Simple, ergonomic API for recording agent runs.
 *
 * This is the recommended entry point for new users:
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 *
 * const r = createReplay({ endpoint: "http://localhost:3000" });
 * await r.record("My Agent", async (run) => {
 *   const docs = await run.step("Search docs", () => searchDocs());
 *   return run.step("Answer", () => makeAnswer(docs));
 * });
 * await r.shutdown();
 * ```
 *
 * It is a thin layer over the lower-level `createClient`/`Trace`/`Span` API,
 * which remains fully supported.
 */
import type {
  SpanKind,
  ModelProvider,
  ModelMessage,
} from "@agent-replay/core";
import { AgentReplayClient } from "./client.js";
import { Trace, type TraceOptions } from "./trace.js";
import { createClient, type CreateClientOptions } from "./factory.js";
import { runContext } from "./context.js";

// ── Options ──────────────────────────────────────────────────────────────────

export type CreateReplayOptions = CreateClientOptions;

export interface RecordOptions extends TraceOptions {
  /** Flush buffered events when the record completes (success or error). Default `true`. */
  flush?: boolean;
}

export interface StepOptions {
  /** Span kind. Defaults to `"custom"`. */
  kind?: SpanKind;
  attributes?: Record<string, unknown>;
}

export interface ToolOptions {
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ModelOptions {
  messages?: ModelMessage[];
  prompt?: string;
  metadata?: Record<string, unknown>;
}

/** What a `run.model(...)` callback should return so tokens/cost can be recorded. */
export interface ModelResult {
  response?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// ── Run scope ────────────────────────────────────────────────────────────────

/**
 * A scope bound to a trace (and, when nested, a parent span). Passed to the
 * `record()` callback and to each `step()` callback so work can be nested.
 */
export interface Run {
  /** The underlying trace (escape hatch to the lower-level API). */
  readonly trace: Trace;
  readonly traceId: string;

  /** Run `fn` inside an auto-managed span. Closes success/error, re-throws. */
  step<T>(name: string, fn: (step: Run) => Promise<T> | T, options?: StepOptions): Promise<T>;

  /** Run a tool call: records input/output (or error) and times it. */
  tool<T>(toolName: string, input: unknown, fn: () => Promise<T> | T, options?: ToolOptions): Promise<T>;

  /** Run a model call. `ref` is `"provider:model"` (e.g. `"openai:gpt-4o"`). */
  model<R extends ModelResult>(ref: string, options: ModelOptions, fn: () => Promise<R> | R): Promise<R>;

  /** Record a log event under the current scope. */
  log(name: string, data?: Record<string, unknown>): void;
}

const KNOWN_PROVIDERS = new Set<ModelProvider>([
  "openai",
  "anthropic",
  "google",
  "ollama",
  "custom",
]);

/** Parse `"provider:model"`. Unknown/absent provider falls back to `"custom"`. */
export function parseModelRef(ref: string): { provider: ModelProvider; model: string } {
  const idx = ref.indexOf(":");
  if (idx > 0) {
    const provider = ref.slice(0, idx).toLowerCase();
    const model = ref.slice(idx + 1);
    if (KNOWN_PROVIDERS.has(provider as ModelProvider) && model) {
      return { provider: provider as ModelProvider, model };
    }
  }
  return { provider: "custom", model: ref };
}

function errInfo(err: unknown): { name: string; message: string } {
  return err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: "Error", message: String(err) };
}

export class RunScope implements Run {
  readonly trace: Trace;
  private readonly parentId?: string;

  constructor(trace: Trace, parentId?: string) {
    this.trace = trace;
    this.parentId = parentId;
  }

  get traceId(): string {
    return this.trace.id;
  }

  async step<T>(
    name: string,
    fn: (step: Run) => Promise<T> | T,
    options?: StepOptions,
  ): Promise<T> {
    const span = this.trace.startSpan(name, {
      kind: options?.kind ?? "custom",
      parentId: this.parentId,
      attributes: options?.attributes,
    });
    const child = new RunScope(this.trace, span.id);
    try {
      const result = await runContext.run(
        { trace: this.trace, parentId: span.id },
        () => Promise.resolve(fn(child)),
      );
      span.end();
      return result;
    } catch (err) {
      span.fail(err instanceof Error ? err : String(err));
      throw err;
    }
  }

  async tool<T>(
    toolName: string,
    input: unknown,
    fn: () => Promise<T> | T,
    options?: ToolOptions,
  ): Promise<T> {
    const span = this.trace.startSpan(toolName, {
      kind: "tool",
      parentId: this.parentId,
      attributes: options?.attributes,
    });
    try {
      const output = await runContext.run(
        { trace: this.trace, parentId: span.id },
        () => Promise.resolve(fn()),
      );
      this.trace.recordToolCall({
        toolName,
        input,
        output,
        status: "success",
        spanId: span.id,
        metadata: options?.metadata,
      });
      span.end();
      return output;
    } catch (err) {
      this.trace.recordToolCall({
        toolName,
        input,
        status: "error",
        spanId: span.id,
        error: err instanceof Error ? err : String(err),
        metadata: options?.metadata,
      });
      span.fail(err instanceof Error ? err : String(err));
      throw err;
    }
  }

  async model<R extends ModelResult>(
    ref: string,
    options: ModelOptions,
    fn: () => Promise<R> | R,
  ): Promise<R> {
    const { provider, model } = parseModelRef(ref);
    const span = this.trace.startSpan(model, {
      kind: "model",
      parentId: this.parentId,
    });
    try {
      const result = await runContext.run(
        { trace: this.trace, parentId: span.id },
        () => Promise.resolve(fn()),
      );
      this.trace.recordModelCall({
        provider,
        model,
        messages: options?.messages,
        prompt: options?.prompt,
        response: result?.response,
        inputTokens: result?.inputTokens,
        outputTokens: result?.outputTokens,
        spanId: span.id,
        metadata: options?.metadata,
      });
      span.end();
      return result;
    } catch (err) {
      this.trace.recordModelCall({
        provider,
        model,
        messages: options?.messages,
        prompt: options?.prompt,
        spanId: span.id,
        metadata: { ...options?.metadata, error: errInfo(err) },
      });
      span.fail(err instanceof Error ? err : String(err));
      throw err;
    }
  }

  log(name: string, data?: Record<string, unknown>): void {
    this.trace.recordEvent("log", name, {
      parentId: this.parentId,
      metadata: data,
    });
  }
}

// ── Replay ───────────────────────────────────────────────────────────────────

/**
 * High-level recorder. Wraps an {@link AgentReplayClient} and exposes the
 * `record` / `step` / `tool` / `model` ergonomics.
 */
export class Replay {
  readonly client: AgentReplayClient;

  constructor(options?: CreateReplayOptions) {
    this.client = createClient(options);
  }

  /** Whether recording is enabled. */
  get enabled(): boolean {
    return this.client.enabled;
  }

  /**
   * Record an agent run. Opens a trace, runs `fn` with a {@link Run} scope,
   * ends the trace on success (storing the return value as output) or marks it
   * failed and re-throws on error. Flushes buffered events by default.
   */
  async record<T>(
    name: string,
    fn: (run: Run) => Promise<T> | T,
    options?: RecordOptions,
  ): Promise<T> {
    const trace = this.client.startTrace(name, {
      input: options?.input,
      metadata: options?.metadata,
    });
    const scope = new RunScope(trace);
    try {
      const result = await runContext.run({ trace }, () =>
        Promise.resolve(fn(scope)),
      );
      trace.end(result);
      return result;
    } catch (err) {
      trace.fail(err instanceof Error ? err : String(err));
      throw err;
    } finally {
      if (options?.flush !== false) {
        await this.client.flush();
      }
    }
  }

  /** Flush buffered events without stopping the collector. */
  flush(): Promise<void> {
    return this.client.flush();
  }

  /** Flush and release resources (timers/connections). Call before exit. */
  shutdown(): Promise<void> {
    return this.client.shutdown();
  }
}

/** Create a {@link Replay}. The recommended entry point for new users. */
export function createReplay(options?: CreateReplayOptions): Replay {
  return new Replay(options);
}

// ── Default lazy instance ─────────────────────────────────────────────────────

let _default: Replay | undefined;
function defaultReplay(): Replay {
  return (_default ??= createReplay());
}

/**
 * A lazily-initialized default {@link Replay} (created on first use with
 * environment defaults). Handy for quick scripts:
 *
 * ```ts
 * import { replay } from "@agent-replay/sdk/simple";
 * await replay.record("My Agent", async (run) => { ... });
 * await replay.shutdown();
 * ```
 */
export const replay = {
  record<T>(
    name: string,
    fn: (run: Run) => Promise<T> | T,
    options?: RecordOptions,
  ): Promise<T> {
    return defaultReplay().record(name, fn, options);
  },
  flush(): Promise<void> {
    return _default ? _default.flush() : Promise.resolve();
  },
  shutdown(): Promise<void> {
    return _default ? _default.shutdown() : Promise.resolve();
  },
  get client(): AgentReplayClient {
    return defaultReplay().client;
  },
};
