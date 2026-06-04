/**
 * HTTP Collector — sends recorded data to the Studio API via batched HTTP requests.
 *
 * Events are buffered in memory and flushed either:
 *  - When the buffer reaches `batchSize`
 *  - On a timer every `flushIntervalMs`
 *  - Manually via `flush()`
 *
 * Failed batches are retried with exponential backoff (up to `maxRetries`).
 */
import type {
  Trace,
  ReplayEvent,
  ReplaySpan,
  ModelCall,
  ToolCall,
} from "@agent-replay/core";
import type { Collector } from "./collector.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** A single ingest item matching the API's discriminated-union schema. */
type IngestItem =
  | { kind: "trace"; data: Trace }
  | { kind: "trace.update"; data: { id: string } & Partial<Omit<Trace, "id">> }
  | { kind: "event"; data: ReplayEvent }
  | { kind: "span"; data: ReplaySpan }
  | { kind: "span.update"; data: { id: string; traceId: string } & Partial<Omit<ReplaySpan, "id" | "traceId">> }
  | { kind: "model_call"; data: ModelCall }
  | { kind: "tool_call"; data: ToolCall };

export interface HttpCollectorOptions {
  /** Base URL of the Studio API (default: "http://localhost:3000"). */
  baseUrl?: string;

  /** API key sent as `Authorization: Bearer <token>` header. */
  apiKey?: string;

  /**
   * Max events to buffer before auto-flushing (default: 50).
   * The ingest API caps at 500 per request.
   */
  batchSize?: number;

  /**
   * Interval in ms between automatic flushes (default: 2000).
   * Set to 0 to disable interval-based flushing.
   */
  flushIntervalMs?: number;

  /** Request timeout in ms (default: 10_000). */
  timeoutMs?: number;

  /** Max retries per failed batch (default: 3). */
  maxRetries?: number;

  /**
   * Callback invoked when a batch fails after all retries.
   * Useful for logging or alerting.
   */
  onError?: (error: Error, droppedCount: number) => void;

  /**
   * Callback invoked after a successful flush.
   */
  onFlush?: (count: number) => void;
}

// ── Collector ───────────────────────────────────────────────────────────────

export class HttpCollector implements Collector {
  private _buffer: IngestItem[] = [];
  private _flushTimer?: ReturnType<typeof setInterval>;
  private _flushing = false;
  private _pendingFlushes: Array<() => void> = [];

  // Config
  private readonly _baseUrl: string;
  private readonly _apiKey?: string;
  private readonly _batchSize: number;
  private readonly _flushIntervalMs: number;
  private readonly _timeoutMs: number;
  private readonly _maxRetries: number;
  private readonly _onError?: (error: Error, droppedCount: number) => void;
  private readonly _onFlush?: (count: number) => void;

  constructor(options: HttpCollectorOptions = {}) {
    this._baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this._apiKey = options.apiKey;
    this._batchSize = options.batchSize ?? 50;
    this._flushIntervalMs = options.flushIntervalMs ?? 2000;
    this._timeoutMs = options.timeoutMs ?? 10_000;
    this._maxRetries = options.maxRetries ?? 3;
    this._onError = options.onError;
    this._onFlush = options.onFlush;

    // Start auto-flush timer
    if (this._flushIntervalMs > 0) {
      this._flushTimer = setInterval(() => {
        this._autoFlush();
      }, this._flushIntervalMs);
      // Don't block process exit
      if (this._flushTimer && typeof this._flushTimer === "object" && "unref" in this._flushTimer) {
        (this._flushTimer as NodeJS.Timeout).unref();
      }
    }
  }

  // ── Collector interface ──────────────────────────────────────────────────

  onTraceStart(trace: Trace): void {
    this._enqueue({ kind: "trace", data: trace });
  }

  onTraceEnd(trace: Trace): void {
    this._enqueue({
      kind: "trace.update",
      data: {
        id: trace.id,
        ...(trace.status && { status: trace.status }),
        ...(trace.endedAt && { endedAt: trace.endedAt }),
        ...(trace.durationMs && { durationMs: trace.durationMs }),
        ...(trace.output !== undefined && { output: trace.output }),
        ...(trace.metadata && { metadata: trace.metadata }),
      },
    });
  }

  onEvent(event: ReplayEvent): void {
    this._enqueue({ kind: "event", data: event });
  }

  onSpanStart(span: ReplaySpan): void {
    this._enqueue({ kind: "span", data: span });
  }

  onSpanEnd(span: ReplaySpan): void {
    this._enqueue({
      kind: "span.update",
      data: {
        id: span.id,
        traceId: span.traceId,
        ...(span.status && { status: span.status }),
        ...(span.endedAt && { endedAt: span.endedAt }),
        ...(span.durationMs && { durationMs: span.durationMs }),
        ...(span.attributes && { attributes: span.attributes }),
      },
    });
  }

  onModelCall(call: ModelCall): void {
    this._enqueue({ kind: "model_call", data: call });
  }

  onToolCall(call: ToolCall): void {
    this._enqueue({ kind: "tool_call", data: call });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Number of items currently buffered. */
  get bufferSize(): number {
    return this._buffer.length;
  }

  /** Whether a flush is currently in progress. */
  get isFlushing(): boolean {
    return this._flushing;
  }

  /**
   * Flush all buffered events to the API.
   * Returns a promise that resolves when the flush completes.
   */
  async flush(): Promise<void> {
    if (this._buffer.length === 0) return;

    // If already flushing, queue this flush
    if (this._flushing) {
      return new Promise<void>((resolve) => {
        this._pendingFlushes.push(resolve);
      });
    }

    return this._doFlush();
  }

  /**
   * Flush remaining events and stop the auto-flush timer.
   * Call this before process shutdown to avoid data loss.
   */
  async shutdown(): Promise<void> {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = undefined;
    }
    await this.flush();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _enqueue(item: IngestItem): void {
    this._buffer.push(item);
    if (this._buffer.length >= this._batchSize) {
      this._autoFlush();
    }
  }

  private _autoFlush(): void {
    if (this._buffer.length > 0 && !this._flushing) {
      // Fire and forget — errors handled via onError callback
      this._doFlush().catch(() => {});
    }
  }

  private async _doFlush(): Promise<void> {
    if (this._buffer.length === 0) return;

    this._flushing = true;
    // Swap buffer so new events go to a fresh array
    const batch = this._buffer;
    this._buffer = [];

    try {
      await this._sendBatch(batch);
      this._onFlush?.(batch.length);
    } catch (err) {
      this._onError?.(
        err instanceof Error ? err : new Error(String(err)),
        batch.length,
      );
    } finally {
      this._flushing = false;

      // Process any queued flushes
      const pending = this._pendingFlushes;
      this._pendingFlushes = [];

      if (this._buffer.length > 0) {
        // More events accumulated — flush again
        this._doFlush()
          .then(() => pending.forEach((r) => r()))
          .catch(() => pending.forEach((r) => r()));
      } else {
        pending.forEach((r) => r());
      }
    }
  }

  private async _sendBatch(batch: IngestItem[]): Promise<void> {
    const url = `${this._baseUrl}/api/ingest`;
    const body = JSON.stringify({ events: batch });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 100ms, 200ms, 400ms...
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        await sleep(delay);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this._timeoutMs);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (this._apiKey) {
          headers["Authorization"] = `Bearer ${this._apiKey}`;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) return;

        // 4xx errors are not retryable
        if (response.status >= 400 && response.status < 500) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `Ingest failed: ${response.status} ${response.statusText} — ${text}`,
          );
        }

        // 5xx — retryable
        lastError = new Error(
          `Ingest failed: ${response.status} ${response.statusText}`,
        );
      } catch (err) {
        // AbortError = timeout, also retryable
        if (err instanceof Error && err.name === "AbortError") {
          lastError = new Error(`Request timed out after ${this._timeoutMs}ms`);
        } else {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
    }

    throw lastError ?? new Error("Ingest failed after retries");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
