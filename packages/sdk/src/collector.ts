import type {
  Trace,
  ReplayEvent,
  ReplaySpan,
  ModelCall,
  ToolCall,
} from "@agent-replay/core";

// ── Collector Interface ──────────────────────────────────────────────────────

/**
 * A Collector receives recorded data from the SDK.
 * Implementations can store in-memory, send over HTTP, write to file, etc.
 */
export interface Collector {
  /** Called when a trace starts. */
  onTraceStart(trace: Trace): void;

  /** Called when a trace ends. */
  onTraceEnd(trace: Trace): void;

  /** Called when an event is recorded. */
  onEvent(event: ReplayEvent): void;

  /** Called when a span starts. */
  onSpanStart(span: ReplaySpan): void;

  /** Called when a span ends. */
  onSpanEnd(span: ReplaySpan): void;

  /** Called when a model call is recorded. */
  onModelCall(call: ModelCall): void;

  /** Called when a tool call is recorded. */
  onToolCall(call: ToolCall): void;
}

// ── Memory Collector ─────────────────────────────────────────────────────────

/**
 * In-memory collector that stores all recorded data in arrays.
 * Useful for testing, demos, and pre-HTTP recording.
 */
export class MemoryCollector implements Collector {
  readonly traces: Trace[] = [];
  readonly events: ReplayEvent[] = [];
  readonly spans: ReplaySpan[] = [];
  readonly modelCalls: ModelCall[] = [];
  readonly toolCalls: ToolCall[] = [];

  onTraceStart(trace: Trace): void {
    // Upsert: replace if same id exists (e.g., trace.update)
    const idx = this.traces.findIndex((t) => t.id === trace.id);
    if (idx >= 0) {
      this.traces[idx] = trace;
    } else {
      this.traces.push(trace);
    }
  }

  onTraceEnd(trace: Trace): void {
    const idx = this.traces.findIndex((t) => t.id === trace.id);
    if (idx >= 0) {
      this.traces[idx] = trace;
    } else {
      this.traces.push(trace);
    }
  }

  onEvent(event: ReplayEvent): void {
    this.events.push(event);
  }

  onSpanStart(span: ReplaySpan): void {
    const idx = this.spans.findIndex((s) => s.id === span.id);
    if (idx >= 0) {
      this.spans[idx] = span;
    } else {
      this.spans.push(span);
    }
  }

  onSpanEnd(span: ReplaySpan): void {
    const idx = this.spans.findIndex((s) => s.id === span.id);
    if (idx >= 0) {
      this.spans[idx] = span;
    } else {
      this.spans.push(span);
    }
  }

  onModelCall(call: ModelCall): void {
    this.modelCalls.push(call);
  }

  onToolCall(call: ToolCall): void {
    this.toolCalls.push(call);
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  /** Get all recorded traces. */
  getTraces(): Trace[] {
    return [...this.traces];
  }

  /** Get all events for a specific trace. */
  getEventsByTrace(traceId: string): ReplayEvent[] {
    return this.events.filter((e) => e.traceId === traceId);
  }

  /** Get all spans for a specific trace. */
  getSpansByTrace(traceId: string): ReplaySpan[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  /** Get all model calls for a specific trace. */
  getModelCallsByTrace(traceId: string): ModelCall[] {
    return this.modelCalls.filter((c) => c.traceId === traceId);
  }

  /** Get all tool calls for a specific trace. */
  getToolCallsByTrace(traceId: string): ToolCall[] {
    return this.toolCalls.filter((c) => c.traceId === traceId);
  }

  /** Get a complete snapshot of a trace with all related data. */
  getTraceDetail(traceId: string) {
    return {
      trace: this.traces.find((t) => t.id === traceId) ?? null,
      events: this.getEventsByTrace(traceId),
      spans: this.getSpansByTrace(traceId),
      modelCalls: this.getModelCallsByTrace(traceId),
      toolCalls: this.getToolCallsByTrace(traceId),
    };
  }

  /** Clear all recorded data. */
  clear(): void {
    this.traces.length = 0;
    this.events.length = 0;
    this.spans.length = 0;
    this.modelCalls.length = 0;
    this.toolCalls.length = 0;
  }
}
