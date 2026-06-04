import { randomUUID } from "node:crypto";
import type {
  Trace as TraceType,
  TraceStatus,
  ReplayEvent,
  EventType,
  ModelCall,
  ModelProvider,
  ModelMessage,
  ToolCall,
  ToolCallStatus,
  ReplayError,
} from "@agent-replay/core";
import { calculateDuration, calculateCost, normalizeError } from "@agent-replay/core";
import type { Collector } from "./collector.js";
import { Span, type SpanOptions } from "./span.js";

// ── Trace Options ────────────────────────────────────────────────────────────

export interface TraceOptions {
  input?: unknown;
  metadata?: Record<string, unknown>;
}

// ── Trace ────────────────────────────────────────────────────────────────────

/**
 * Represents a complete agent execution.
 * A Trace is the top-level container for spans, events, model calls, and tool calls.
 */
export class Trace {
  readonly id: string;
  readonly name: string;

  private _status: TraceStatus = "running";
  private _startedAt: number;
  private _endedAt?: number;
  private _input?: unknown;
  private _output?: unknown;
  private _metadata: Record<string, unknown>;
  private _collector: Collector;

  constructor(name: string, collector: Collector, options?: TraceOptions) {
    this.id = randomUUID();
    this.name = name;
    this._startedAt = Date.now();
    this._input = options?.input;
    this._metadata = { ...options?.metadata };
    this._collector = collector;

    // Emit trace.start
    this._emitTrace("start");
  }

  /** Get the current status. */
  get status(): TraceStatus {
    return this._status;
  }

  /** Get the start timestamp. */
  get startedAt(): number {
    return this._startedAt;
  }

  /** Get the end timestamp. */
  get endedAt(): number | undefined {
    return this._endedAt;
  }

  /** Get the duration in ms. */
  get durationMs(): number | undefined {
    return calculateDuration(this._startedAt, this._endedAt);
  }

  // ── Spans ────────────────────────────────────────────────────────────────

  /** Start a new span within this trace. */
  startSpan(name: string, options?: SpanOptions): Span {
    return new Span(this.id, name, this._collector, {
      ...options,
      parentId: options?.parentId,
    });
  }

  // ── Events ───────────────────────────────────────────────────────────────

  /** Record a generic event (log, warning, etc.). */
  recordEvent(
    type: EventType,
    name: string,
    options?: {
      parentId?: string;
      input?: unknown;
      output?: unknown;
      error?: ReplayError;
      metadata?: Record<string, unknown>;
    },
  ): ReplayEvent {
    const event: ReplayEvent = {
      id: randomUUID(),
      traceId: this.id,
      parentId: options?.parentId,
      type,
      name,
      timestamp: Date.now(),
      input: options?.input,
      output: options?.output,
      error: options?.error,
      metadata: options?.metadata,
    };
    this._collector.onEvent(event);
    return event;
  }

  /** Convenience: record a log event. */
  log(name: string, data?: Record<string, unknown>): ReplayEvent {
    return this.recordEvent("log", name, { metadata: data });
  }

  // ── Model Calls ──────────────────────────────────────────────────────────

  /** Record a model (LLM) call with token usage and cost estimation. */
  recordModelCall(options: {
    provider: ModelProvider;
    model: string;
    prompt?: string;
    messages?: ModelMessage[];
    response?: string;
    inputTokens?: number;
    outputTokens?: number;
    spanId?: string;
    metadata?: Record<string, unknown>;
  }): ModelCall {
    const totalTokens =
      (options.inputTokens ?? 0) + (options.outputTokens ?? 0);

    const estimatedCostUsd = calculateCost(
      options.model,
      options.inputTokens ?? 0,
      options.outputTokens ?? 0,
    );

    const call: ModelCall = {
      id: randomUUID(),
      traceId: this.id,
      spanId: options.spanId,
      provider: options.provider,
      model: options.model,
      prompt: options.prompt,
      messages: options.messages,
      response: options.response,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      totalTokens: totalTokens > 0 ? totalTokens : undefined,
      estimatedCostUsd,
      startedAt: Date.now(),
      metadata: options.metadata,
    };
    this._collector.onModelCall(call);
    return call;
  }

  // ── Tool Calls ───────────────────────────────────────────────────────────

  /** Record a tool call (function execution, API call, etc.). */
  recordToolCall(options: {
    toolName: string;
    input: unknown;
    output?: unknown;
    status?: ToolCallStatus;
    spanId?: string;
    error?: Error | string;
    metadata?: Record<string, unknown>;
  }): ToolCall {
    const call: ToolCall = {
      id: randomUUID(),
      traceId: this.id,
      spanId: options.spanId,
      toolName: options.toolName,
      input: options.input,
      output: options.output,
      status: options.status ?? "success",
      startedAt: Date.now(),
      error: options.error ? normalizeError(options.error) : undefined,
      metadata: options.metadata,
    };
    this._collector.onToolCall(call);
    return call;
  }

  // ── Errors ───────────────────────────────────────────────────────────────

  /** Record an error event within this trace. */
  recordError(
    error: Error | string,
    options?: { metadata?: Record<string, unknown> },
  ): ReplayEvent {
    return this.recordEvent("error", "error", {
      error: normalizeError(error),
      metadata: options?.metadata,
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** End the trace with a success status. */
  end(output?: unknown): void {
    if (this._status !== "running") return;
    this._endedAt = Date.now();
    this._status = "success";
    this._output = output;
    this._emitTrace("end");
  }

  /** End the trace with an error status. */
  fail(error: Error | string, output?: unknown): void {
    if (this._status !== "running") return;
    this._endedAt = Date.now();
    this._status = "error";
    this._output = output;
    this.recordError(error);
    this._emitTrace("end");
  }

  /** Cancel the trace. */
  cancel(): void {
    if (this._status !== "running") return;
    this._endedAt = Date.now();
    this._status = "cancelled";
    this._emitTrace("end");
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private _emitTrace(phase: "start" | "end"): void {
    const trace: TraceType = {
      id: this.id,
      name: this.name,
      status: this._status,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      durationMs: this.durationMs,
      input: this._input,
      output: this._output,
      metadata:
        Object.keys(this._metadata).length > 0
          ? { ...this._metadata }
          : undefined,
    };

    if (phase === "start") {
      this._collector.onTraceStart(trace);
    } else {
      this._collector.onTraceEnd(trace);
    }
  }
}
