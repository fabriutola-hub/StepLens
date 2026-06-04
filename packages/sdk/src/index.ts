// @agent-replay/sdk — recording client for agent executions

// ── Collector ────────────────────────────────────────────────────────────────
export { MemoryCollector } from "./collector.js";
export type { Collector } from "./collector.js";

// ── HTTP Collector ───────────────────────────────────────────────────────────
export { HttpCollector } from "./http-collector.js";
export type { HttpCollectorOptions } from "./http-collector.js";

// ── Client ───────────────────────────────────────────────────────────────────
export { AgentReplayClient } from "./client.js";
export type { AgentReplayClientOptions } from "./client.js";

// ── Trace & Span ─────────────────────────────────────────────────────────────
export { Trace } from "./trace.js";
export type { TraceOptions } from "./trace.js";
export { Span } from "./span.js";
export type { SpanOptions } from "./span.js";

// ── Instrumentation helpers ──────────────────────────────────────────────────
export { withSpan, withModelCall, withToolCall } from "./instrument.js";
export type { ModelCallOptions, ModelCallResult, ToolCallOptions } from "./instrument.js";

// ── Convenience factory ──────────────────────────────────────────────────────
export { createClient, DEFAULT_ENDPOINT } from "./factory.js";
export type { CreateClientOptions } from "./factory.js";

// ── Simple API (recommended entry point: "@agent-replay/sdk/simple") ──────────
// Re-exported here for discoverability; prefer importing from the subpath.
export { createReplay, replay, Replay, RunScope } from "./simple.js";
export type {
  CreateReplayOptions,
  RecordOptions,
  Run,
  StepOptions,
  ToolOptions,
  ModelOptions,
  ModelResult,
} from "./simple.js";

// ── Version ──────────────────────────────────────────────────────────────────
export const SDK_VERSION = "0.3.0";
