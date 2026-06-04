import type {
  EventType,
  SpanKind,
  TraceStatus,
  SpanStatus,
  ToolCallStatus,
  ModelProvider,
  MessageRole,
} from "./constants.js";

// ── Trace ────────────────────────────────────────────────────────────────────
export interface Trace {
  id: string;
  name: string;
  status: TraceStatus;
  startedAt: number; // epoch ms
  endedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

// ── Replay Error ─────────────────────────────────────────────────────────────
export interface ReplayError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

// ── Replay Event ─────────────────────────────────────────────────────────────
export interface ReplayEvent {
  id: string;
  traceId: string;
  parentId?: string;
  type: EventType;
  name: string;
  timestamp: number; // epoch ms
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: ReplayError;
  metadata?: Record<string, unknown>;
}

// ── Replay Span ──────────────────────────────────────────────────────────────
export interface ReplaySpan {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  startedAt: number; // epoch ms
  endedAt?: number;
  durationMs?: number;
  attributes?: Record<string, unknown>;
}

// ── Model Call ───────────────────────────────────────────────────────────────
export interface ModelMessage {
  role: MessageRole;
  content: string;
}

export interface ModelCall {
  id: string;
  traceId: string;
  spanId?: string;
  provider: ModelProvider;
  model: string;
  prompt?: string;
  messages?: ModelMessage[];
  response?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  startedAt: number; // epoch ms
  endedAt?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

// ── Tool Call ────────────────────────────────────────────────────────────────
export interface ToolCall {
  id: string;
  traceId: string;
  spanId?: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: ToolCallStatus;
  startedAt: number; // epoch ms
  endedAt?: number;
  durationMs?: number;
  error?: ReplayError;
  metadata?: Record<string, unknown>;
}
