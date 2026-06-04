import type { Collector } from "./collector.js";
import { MemoryCollector } from "./collector.js";
import { Trace, type TraceOptions } from "./trace.js";

// ── Client Options ───────────────────────────────────────────────────────────

export interface AgentReplayClientOptions {
  /** The collector to use for recording. Defaults to MemoryCollector. */
  collector?: Collector;

  /**
   * Whether the SDK is enabled. When false, all methods are no-ops.
   * Useful for disabling recording in tests or production.
   * @default true
   */
  enabled?: boolean;
}

// ── Agent Replay Client ─────────────────────────────────────────────────────

/**
 * The main entry point for recording agent executions.
 *
 * @example
 * ```ts
 * import { AgentReplayClient } from "@agent-replay/sdk";
 *
 * const client = new AgentReplayClient();
 * const trace = client.startTrace("my-agent", { input: "Hello" });
 *
 * const span = trace.startSpan("search", { kind: "tool" });
 * // ... do work ...
 * span.end();
 *
 * trace.end("Done!");
 * ```
 */
export class AgentReplayClient {
  readonly collector: Collector;
  private _enabled: boolean;

  constructor(options?: AgentReplayClientOptions) {
    this.collector = options?.collector ?? new MemoryCollector();
    this._enabled = options?.enabled ?? true;
  }

  /** Whether the SDK is currently enabled. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Enable or disable recording. */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Start a new trace (agent execution).
   * Returns a Trace instance that can be used to record spans, events,
   * model calls, tool calls, and errors.
   */
  startTrace(name: string, options?: TraceOptions): Trace {
    if (!this._enabled) {
      // Return a no-op trace that still has the right API
      // but won't crash if used. The collector just won't receive data
      // since we use a throwaway MemoryCollector.
      return new Trace(name, new MemoryCollector(), options);
    }
    return new Trace(name, this.collector, options);
  }

  /**
   * Run an async function inside a trace. Auto-captures errors
   * and ends the trace when the function completes.
   *
   * @example
   * ```ts
   * const result = await client.run("my-agent", async (trace) => {
   *   const span = trace.startSpan("step-1");
   *   // ... work ...
   *   span.end();
   *   return "result";
   * });
   * ```
   */
  async run<T>(
    name: string,
    fn: (trace: Trace) => Promise<T>,
    options?: TraceOptions,
  ): Promise<T> {
    const trace = this.startTrace(name, options);
    try {
      const result = await fn(trace);
      trace.end(result);
      return result;
    } catch (error) {
      trace.fail(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Flush any buffered data to the collector, if it supports flushing.
   * No-op for collectors (like {@link MemoryCollector}) that have no buffer.
   */
  async flush(): Promise<void> {
    const collector = this.collector as Partial<{ flush: () => Promise<void> }>;
    if (typeof collector.flush === "function") {
      await collector.flush();
    }
  }

  /**
   * Flush remaining data and release resources (timers, connections).
   * Call this before your process exits to avoid losing the final batch
   * of events. Delegates to the collector's `shutdown()` when available.
   *
   * @example
   * ```ts
   * const client = createClient();
   * // ... record ...
   * await client.shutdown();
   * ```
   */
  async shutdown(): Promise<void> {
    const collector = this.collector as Partial<{
      shutdown: () => Promise<void>;
      flush: () => Promise<void>;
    }>;
    if (typeof collector.shutdown === "function") {
      await collector.shutdown();
    } else if (typeof collector.flush === "function") {
      await collector.flush();
    }
  }
}
