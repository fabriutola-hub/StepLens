/**
 * Drizzle ORM schema for StepLens.
 *
 * Every table maps 1-to-1 with the TypeScript interfaces in @agent-replay/core.
 * JSON columns are used for structured data (input/output, metadata, messages,
 * attributes, error) since SQLite has no native JSON type — we store TEXT and
 * parse in application code via Drizzle's `mode: "json"`.
 */
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ── Traces ──────────────────────────────────────────────────────────────────
export const traces = sqliteTable(
  "traces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["running", "success", "error", "cancelled"],
    })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    endedAt: integer("ended_at", { mode: "number" }),
    durationMs: integer("duration_ms", { mode: "number" }),
    input: text("input", { mode: "json" }),
    output: text("output", { mode: "json" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("traces_started_at_idx").on(table.startedAt),
    index("traces_status_idx").on(table.status),
    index("traces_name_idx").on(table.name),
  ]
);

// ── Events ──────────────────────────────────────────────────────────────────
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    type: text("type", {
      enum: [
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
      ],
    }).notNull(),
    name: text("name").notNull(),
    timestamp: integer("timestamp", { mode: "number" }).notNull(),
    durationMs: integer("duration_ms", { mode: "number" }),
    input: text("input", { mode: "json" }),
    output: text("output", { mode: "json" }),
    error: text("error", { mode: "json" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("events_trace_id_idx").on(table.traceId),
    index("events_timestamp_idx").on(table.timestamp),
    index("events_type_idx").on(table.type),
    index("events_trace_timestamp_idx").on(table.traceId, table.timestamp),
  ]
);

// ── Spans ───────────────────────────────────────────────────────────────────
export const spans = sqliteTable(
  "spans",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["agent", "model", "tool", "retrieval", "parser", "custom"],
    })
      .notNull()
      .default("custom"),
    status: text("status", {
      enum: ["running", "success", "error"],
    })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    endedAt: integer("ended_at", { mode: "number" }),
    durationMs: integer("duration_ms", { mode: "number" }),
    attributes: text("attributes", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("spans_trace_id_idx").on(table.traceId),
    index("spans_parent_id_idx").on(table.parentId),
    index("spans_started_at_idx").on(table.startedAt),
    index("spans_trace_started_idx").on(table.traceId, table.startedAt),
  ]
);

// ── Model Calls ─────────────────────────────────────────────────────────────
export const modelCalls = sqliteTable(
  "model_calls",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    spanId: text("span_id").references(() => spans.id, { onDelete: "set null" }),
    provider: text("provider", {
      enum: ["openai", "anthropic", "google", "ollama", "custom"],
    }).notNull(),
    model: text("model").notNull(),
    prompt: text("prompt"),
    messages: text("messages", { mode: "json" }),
    response: text("response"),
    inputTokens: integer("input_tokens", { mode: "number" }),
    outputTokens: integer("output_tokens", { mode: "number" }),
    totalTokens: integer("total_tokens", { mode: "number" }),
    // Estimated cost in USD (decimal dollars, e.g. 0.0013 — never cents).
    estimatedCostUsd: real("estimated_cost_usd"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    endedAt: integer("ended_at", { mode: "number" }),
    durationMs: integer("duration_ms", { mode: "number" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("model_calls_trace_id_idx").on(table.traceId),
    index("model_calls_span_id_idx").on(table.spanId),
    index("model_calls_started_at_idx").on(table.startedAt),
    index("model_calls_model_idx").on(table.model),
  ]
);

// ── Tool Calls ──────────────────────────────────────────────────────────────
export const toolCalls = sqliteTable(
  "tool_calls",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    spanId: text("span_id").references(() => spans.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    input: text("input", { mode: "json" }),
    output: text("output", { mode: "json" }),
    status: text("status", {
      enum: ["running", "success", "error"],
    })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    endedAt: integer("ended_at", { mode: "number" }),
    durationMs: integer("duration_ms", { mode: "number" }),
    error: text("error", { mode: "json" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("tool_calls_trace_id_idx").on(table.traceId),
    index("tool_calls_span_id_idx").on(table.spanId),
    index("tool_calls_started_at_idx").on(table.startedAt),
    index("tool_calls_tool_name_idx").on(table.toolName),
  ]
);

// ── Trace Annotations (local Studio metadata) ─────────────────────────────────
//
// Per-trace, machine-local metadata that is NOT part of the recorded trace and
// is never written by the ingest API or included in exports. One row per trace.
export const traceAnnotations = sqliteTable(
  "trace_annotations",
  {
    traceId: text("trace_id")
      .primaryKey()
      .references(() => traces.id, { onDelete: "cascade" }),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("trace_annotations_favorite_idx").on(table.favorite)]
);

// ── Saved Views ───────────────────────────────────────────────────────────────
//
// Named, reusable workbench filter sets. `filtersJson` stores the same filter
// object the workbench sends to /api/traces (q, status, model, tool, …).
export const savedViews = sqliteTable("saved_views", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  filtersJson: text("filters_json", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});