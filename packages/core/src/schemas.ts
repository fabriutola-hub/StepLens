import { z } from "zod";
import {
  EVENT_TYPES,
  SPAN_KINDS,
  TRACE_STATUSES,
  SPAN_STATUSES,
  TOOL_CALL_STATUSES,
  MODEL_PROVIDERS,
  MESSAGE_ROLES,
} from "./constants.js";

// ── Replay Error Schema ──────────────────────────────────────────────────────
export const replayErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  cause: z.unknown().optional(),
});

// ── Trace Schemas ────────────────────────────────────────────────────────────
export const traceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(TRACE_STATUSES),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createTraceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(TRACE_STATUSES).default("running"),
  startedAt: z.number(),
  input: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateTraceSchema = z.object({
  status: z.enum(TRACE_STATUSES).optional(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  output: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ── Event Schemas ────────────────────────────────────────────────────────────
export const replayEventSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentId: z.string().optional(),
  type: z.enum(EVENT_TYPES),
  name: z.string(),
  timestamp: z.number(),
  durationMs: z.number().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: replayErrorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createEventSchema = z.object({
  id: z.string().optional(),
  traceId: z.string(),
  parentId: z.string().optional(),
  type: z.enum(EVENT_TYPES),
  name: z.string(),
  timestamp: z.number().optional(),
  durationMs: z.number().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: replayErrorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ── Span Schemas ─────────────────────────────────────────────────────────────
export const replaySpanSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentId: z.string().optional(),
  name: z.string(),
  kind: z.enum(SPAN_KINDS),
  status: z.enum(SPAN_STATUSES),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const createSpanSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentId: z.string().optional(),
  name: z.string(),
  kind: z.enum(SPAN_KINDS).default("custom"),
  status: z.enum(SPAN_STATUSES).default("running"),
  startedAt: z.number(),
  attributes: z.record(z.unknown()).optional(),
});

export const updateSpanSchema = z.object({
  status: z.enum(SPAN_STATUSES).optional(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  attributes: z.record(z.unknown()).optional(),
});

// ── Model Call Schemas ───────────────────────────────────────────────────────
export const modelMessageSchema = z.object({
  role: z.enum(MESSAGE_ROLES),
  content: z.string(),
});

export const modelCallSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  spanId: z.string().optional(),
  provider: z.enum(MODEL_PROVIDERS),
  model: z.string(),
  prompt: z.string().optional(),
  messages: z.array(modelMessageSchema).optional(),
  response: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createModelCallSchema = modelCallSchema;

// ── Tool Call Schemas ────────────────────────────────────────────────────────
export const toolCallSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  spanId: z.string().optional(),
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
  status: z.enum(TOOL_CALL_STATUSES),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  durationMs: z.number().optional(),
  error: replayErrorSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createToolCallSchema = toolCallSchema;

// ── Batch Ingest Schema ──────────────────────────────────────────────────────
/**
 * Discriminated union for the batch ingest endpoint.
 * Each event in the batch declares its `kind` so the server knows which
 * table to insert into.
 */
export const ingestEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trace"), data: createTraceSchema }),
  z.object({ kind: z.literal("event"), data: createEventSchema }),
  z.object({ kind: z.literal("span"), data: createSpanSchema }),
  z.object({ kind: z.literal("span.update"), data: z.object({ id: z.string(), traceId: z.string() }).merge(updateSpanSchema) }),
  z.object({ kind: z.literal("trace.update"), data: z.object({ id: z.string() }).merge(updateTraceSchema) }),
  z.object({ kind: z.literal("model_call"), data: createModelCallSchema }),
  z.object({ kind: z.literal("tool_call"), data: createToolCallSchema }),
]);

export const batchIngestSchema = z.object({
  events: z.array(ingestEventSchema).max(500),
});

// ── Trace Export / Import Schema ─────────────────────────────────────────────
/**
 * A self-contained trace bundle, as produced by the export endpoint and
 * consumed by the import endpoint. `spans` may be a tree (each span carrying
 * `children`) or a flat list — importers flatten it before inserting.
 *
 * These schemas are intentionally lenient: a real export serializes absent
 * optional fields as JSON `null`, so every optional field is `.nullish()`
 * (null OR undefined). This keeps the strict ingest schemas above untouched.
 */
const importTraceSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(TRACE_STATUSES),
  startedAt: z.number(),
  endedAt: z.number().nullish(),
  durationMs: z.number().nullish(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

const importEventSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  parentId: z.string().nullish(),
  type: z.enum(EVENT_TYPES),
  name: z.string(),
  timestamp: z.number(),
  durationMs: z.number().nullish(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  error: z.unknown().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

type ImportSpan = {
  id: string;
  traceId: string;
  parentId?: string | null;
  name: string;
  kind: (typeof SPAN_KINDS)[number];
  status: (typeof SPAN_STATUSES)[number];
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
  attributes?: Record<string, unknown> | null;
  children?: ImportSpan[] | null;
};

const importSpanSchema: z.ZodType<ImportSpan> = z.lazy(() =>
  z.object({
    id: z.string(),
    traceId: z.string(),
    parentId: z.string().nullish(),
    name: z.string(),
    kind: z.enum(SPAN_KINDS),
    status: z.enum(SPAN_STATUSES),
    startedAt: z.number(),
    endedAt: z.number().nullish(),
    durationMs: z.number().nullish(),
    attributes: z.record(z.unknown()).nullish(),
    children: z.array(importSpanSchema).nullish(),
  }),
);

const importModelCallSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  spanId: z.string().nullish(),
  provider: z.enum(MODEL_PROVIDERS),
  model: z.string(),
  prompt: z.string().nullish(),
  messages: z.array(modelMessageSchema).nullish(),
  response: z.string().nullish(),
  inputTokens: z.number().nullish(),
  outputTokens: z.number().nullish(),
  totalTokens: z.number().nullish(),
  estimatedCostUsd: z.number().nullish(),
  startedAt: z.number(),
  endedAt: z.number().nullish(),
  durationMs: z.number().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

const importToolCallSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  spanId: z.string().nullish(),
  toolName: z.string(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  status: z.enum(TOOL_CALL_STATUSES),
  startedAt: z.number(),
  endedAt: z.number().nullish(),
  durationMs: z.number().nullish(),
  error: z.unknown().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

export const traceExportSchema = z.object({
  version: z.string().nullish(),
  exportedAt: z.number().nullish(),
  trace: importTraceSchema,
  events: z.array(importEventSchema).default([]),
  spans: z.array(importSpanSchema).default([]),
  modelCalls: z.array(importModelCallSchema).default([]),
  toolCalls: z.array(importToolCallSchema).default([]),
});

export type TraceExport = z.infer<typeof traceExportSchema>;

// ── Inferred types from schemas ──────────────────────────────────────────────
export type CreateTraceInput = z.infer<typeof createTraceSchema>;
export type UpdateTraceInput = z.infer<typeof updateTraceSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateSpanInput = z.infer<typeof createSpanSchema>;
export type UpdateSpanInput = z.infer<typeof updateSpanSchema>;
export type CreateModelCallInput = z.infer<typeof createModelCallSchema>;
export type CreateToolCallInput = z.infer<typeof createToolCallSchema>;
export type IngestEvent = z.infer<typeof ingestEventSchema>;
export type BatchIngest = z.infer<typeof batchIngestSchema>;
