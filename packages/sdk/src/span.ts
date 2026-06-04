import { randomUUID } from "node:crypto";
import type {
  ReplaySpan,
  SpanKind,
  SpanStatus,
} from "@agent-replay/core";
import { calculateDuration } from "@agent-replay/core";
import type { Collector } from "./collector.js";

// ── Span ─────────────────────────────────────────────────────────────────────

export interface SpanOptions {
  kind?: SpanKind;
  parentId?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Represents a timed operation within a trace.
 * Spans can be nested (parent-child) to form a tree of operations.
 */
export class Span {
  readonly id: string;
  readonly traceId: string;
  readonly parentId?: string;
  readonly name: string;
  readonly kind: SpanKind;

  private _status: SpanStatus = "running";
  private _startedAt: number;
  private _endedAt?: number;
  private _attributes: Record<string, unknown>;
  private _collector: Collector;

  constructor(
    traceId: string,
    name: string,
    collector: Collector,
    options?: SpanOptions,
  ) {
    this.id = randomUUID();
    this.traceId = traceId;
    this.parentId = options?.parentId;
    this.name = name;
    this.kind = options?.kind ?? "custom";
    this._startedAt = Date.now();
    this._attributes = { ...options?.attributes };
    this._collector = collector;

    // Emit span.start
    this._emitSpan();
  }

  /** Get the current status of the span. */
  get status(): SpanStatus {
    return this._status;
  }

  /** Get the start timestamp. */
  get startedAt(): number {
    return this._startedAt;
  }

  /** Get the end timestamp (undefined if still running). */
  get endedAt(): number | undefined {
    return this._endedAt;
  }

  /** Get the duration in ms (undefined if still running). */
  get durationMs(): number | undefined {
    return calculateDuration(this._startedAt, this._endedAt);
  }

  /** Set an arbitrary attribute on the span. */
  setAttribute(key: string, value: unknown): this {
    this._attributes[key] = value;
    return this;
  }

  /** Start a child span nested under this span. */
  startChildSpan(name: string, options?: Omit<SpanOptions, "parentId">): Span {
    return new Span(this.traceId, name, this._collector, {
      ...options,
      parentId: this.id,
    });
  }

  /** End the span with a success status. */
  end(): void {
    if (this._status !== "running") return; // already ended
    this._endedAt = Date.now();
    this._status = "success";
    this._emitSpan();
  }

  /** End the span with an error status. */
  fail(error?: Error | string): void {
    if (this._status !== "running") return;
    this._endedAt = Date.now();
    this._status = "error";
    if (error) {
      this._attributes["error"] =
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { name: "Error", message: String(error) };
    }
    this._emitSpan();
  }

  /** Build and emit the current span snapshot to the collector. */
  private _emitSpan(): void {
    const span: ReplaySpan = {
      id: this.id,
      traceId: this.traceId,
      parentId: this.parentId,
      name: this.name,
      kind: this.kind,
      status: this._status,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      durationMs: this.durationMs,
      attributes: Object.keys(this._attributes).length > 0
        ? { ...this._attributes }
        : undefined,
    };

    if (this._status === "running") {
      this._collector.onSpanStart(span);
    } else {
      this._collector.onSpanEnd(span);
    }
  }
}
