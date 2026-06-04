// ── Event Types ──────────────────────────────────────────────────────────────
export const EVENT_TYPES = [
  "trace.start",
  "trace.end",
  "span.start",
  "span.end",
  "model.call",
  "model.response",
  "tool.call",
  "tool.result",
  "error",
  "log",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ── Span Kinds ───────────────────────────────────────────────────────────────
export const SPAN_KINDS = [
  "agent",
  "model",
  "tool",
  "retrieval",
  "parser",
  "custom",
] as const;

export type SpanKind = (typeof SPAN_KINDS)[number];

// ── Statuses ─────────────────────────────────────────────────────────────────
export const TRACE_STATUSES = [
  "running",
  "success",
  "error",
  "cancelled",
] as const;

export type TraceStatus = (typeof TRACE_STATUSES)[number];

export const SPAN_STATUSES = [
  "running",
  "success",
  "error",
] as const;

export type SpanStatus = (typeof SPAN_STATUSES)[number];

export const TOOL_CALL_STATUSES = [
  "running",
  "success",
  "error",
] as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

// ── Model Providers ──────────────────────────────────────────────────────────
export const MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "custom",
] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

// ── Message Roles ────────────────────────────────────────────────────────────
export const MESSAGE_ROLES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];
