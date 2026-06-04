// @agent-replay/core — shared types, schemas, and utilities

// ── Constants ────────────────────────────────────────────────────────────────
export {
  EVENT_TYPES,
  SPAN_KINDS,
  TRACE_STATUSES,
  SPAN_STATUSES,
  TOOL_CALL_STATUSES,
  MODEL_PROVIDERS,
  MESSAGE_ROLES,
} from "./constants.js";

export type {
  EventType,
  SpanKind,
  TraceStatus,
  SpanStatus,
  ToolCallStatus,
  ModelProvider,
  MessageRole,
} from "./constants.js";

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  Trace,
  ReplayEvent,
  ReplaySpan,
  ModelCall,
  ModelMessage,
  ToolCall,
  ReplayError,
} from "./types.js";

// ── Schemas ──────────────────────────────────────────────────────────────────
export {
  replayErrorSchema,
  traceSchema,
  createTraceSchema,
  updateTraceSchema,
  replayEventSchema,
  createEventSchema,
  replaySpanSchema,
  createSpanSchema,
  updateSpanSchema,
  modelMessageSchema,
  modelCallSchema,
  createModelCallSchema,
  toolCallSchema,
  createToolCallSchema,
  ingestEventSchema,
  batchIngestSchema,
  traceExportSchema,
} from "./schemas.js";

export type {
  CreateTraceInput,
  UpdateTraceInput,
  CreateEventInput,
  CreateSpanInput,
  UpdateSpanInput,
  CreateModelCallInput,
  CreateToolCallInput,
  IngestEvent,
  BatchIngest,
  TraceExport,
} from "./schemas.js";

// ── Cost ─────────────────────────────────────────────────────────────────────
export { calculateCost, lookupPricing, getAllPricing } from "./cost.js";

// ── Normalize ────────────────────────────────────────────────────────────────
export {
  generateId,
  normalizeEvent,
  normalizeError,
  calculateDuration,
} from "./normalize.js";

export type { NormalizeResult } from "./normalize.js";

// ── Version ──────────────────────────────────────────────────────────────────
export const CORE_VERSION = "0.3.0";
