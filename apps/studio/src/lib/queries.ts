import {
  eq,
  and,
  or,
  asc,
  desc,
  count,
  sql,
  inArray,
  gte,
  lte,
  like,
  type SQL,
} from "drizzle-orm";
import { getDatabase } from "../db/connection";
import {
  traces,
  events,
  spans,
  modelCalls,
  toolCalls,
  traceAnnotations,
  savedViews,
} from "../db/schema";
import { calculateCost, generateId, type TraceExport } from "@agent-replay/core";
import type {
  Annotation,
  AnnotationInput,
  CompareResult,
  CompareTraceSummary,
  SavedView,
  TraceFilters,
  TraceListParams,
  TraceSortField,
  TraceStats,
} from "./trace-types";

// ── Filters ───────────────────────────────────────────────────────────────────

const SORT_COLUMNS = {
  startedAt: traces.startedAt,
  durationMs: traces.durationMs,
  name: traces.name,
  status: traces.status,
} as const;

/**
 * Build the SQL conditions for the advanced trace filters. Shared by the list
 * and stats queries so the filtered population is identical for both.
 */
function buildTraceConditions(filters: TraceFilters): SQL[] {
  const conds: SQL[] = [];

  if (filters.q) {
    const pat = `%${filters.q}%`;
    conds.push(or(like(traces.name, pat), like(traces.id, pat))!);
  }
  if (filters.status) {
    conds.push(eq(traces.status, filters.status as never));
  }
  if (filters.from != null) {
    conds.push(gte(traces.startedAt, filters.from));
  }
  if (filters.to != null) {
    conds.push(lte(traces.startedAt, filters.to));
  }
  if (filters.model) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${modelCalls} mc WHERE mc.trace_id = ${traces.id} AND mc.model = ${filters.model})`
    );
  }
  if (filters.tool) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${toolCalls} tc WHERE tc.trace_id = ${traces.id} AND tc.tool_name = ${filters.tool})`
    );
  }
  if (filters.hasError) {
    conds.push(
      sql`(${traces.status} = 'error'
        OR EXISTS (SELECT 1 FROM ${events} e WHERE e.trace_id = ${traces.id} AND (e.type = 'error' OR e.error IS NOT NULL))
        OR EXISTS (SELECT 1 FROM ${spans} s WHERE s.trace_id = ${traces.id} AND s.status = 'error')
        OR EXISTS (SELECT 1 FROM ${toolCalls} t WHERE t.trace_id = ${traces.id} AND t.status = 'error'))`
    );
  }
  if (filters.favorite) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${traceAnnotations} a WHERE a.trace_id = ${traces.id} AND a.favorite = 1)`
    );
  }
  if (filters.tag) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${traceAnnotations} a, json_each(a.tags) je WHERE a.trace_id = ${traces.id} AND je.value = ${filters.tag})`
    );
  }

  return conds;
}

export async function getTracesList(options: TraceListParams = {}) {
  const db = getDatabase();
  const {
    limit = 20,
    offset = 0,
    sort = "startedAt",
    order = "desc",
    ...filters
  } = options;

  const conds = buildTraceConditions(filters);
  const where = conds.length ? and(...conds) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(traces)
    .where(where);

  const sortCol = SORT_COLUMNS[sort as TraceSortField] ?? traces.startedAt;
  const dir = order === "asc" ? asc : desc;

  const list = await db
    .select({
      id: traces.id,
      name: traces.name,
      status: traces.status,
      startedAt: traces.startedAt,
      endedAt: traces.endedAt,
      durationMs: traces.durationMs,
      favorite: traceAnnotations.favorite,
      note: traceAnnotations.note,
      tags: traceAnnotations.tags,
    })
    .from(traces)
    .leftJoin(traceAnnotations, eq(traceAnnotations.traceId, traces.id))
    .where(where)
    .orderBy(dir(sortCol))
    .limit(limit)
    .offset(offset);

  // Aggregate costs for listed traces.
  const traceIds = list.map((t) => t.id);
  const costs: Record<string, number> = {};
  if (traceIds.length > 0) {
    const costRows = db
      .select({
        traceId: modelCalls.traceId,
        cost: sql<number>`SUM(${modelCalls.estimatedCostUsd})`,
      })
      .from(modelCalls)
      .where(inArray(modelCalls.traceId, traceIds))
      .groupBy(modelCalls.traceId)
      .all();
    for (const row of costRows) {
      if (row.traceId && row.cost != null) {
        costs[row.traceId] = Number(row.cost);
      }
    }
  }

  return {
    traces: list.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      durationMs: t.durationMs,
      estimatedCostUsd: costs[t.id] ?? 0,
      favorite: Boolean(t.favorite),
      note: t.note ?? null,
      tags: (t.tags as string[] | null) ?? [],
    })),
    total: totalResult?.count ?? 0,
  };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

/**
 * Aggregate statistics over the filtered trace population (ignores paging and
 * sort). Powers the workbench stats strip.
 */
export async function getTracesStats(filters: TraceFilters = {}): Promise<TraceStats> {
  const db = getDatabase();
  const conds = buildTraceConditions(filters);
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: traces.id,
      status: traces.status,
      durationMs: traces.durationMs,
    })
    .from(traces)
    .where(where);

  const total = rows.length;
  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }

  const durations = rows
    .map((r) => r.durationMs)
    .filter((d): d is number => d != null);
  const totalDurationMs = durations.reduce((a, b) => a + b, 0);
  const avgDurationMs = durations.length ? totalDurationMs / durations.length : 0;
  const p95DurationMs = percentile(durations, 95);

  let totalTokens = 0;
  let estimatedCostUsd = 0;
  const modelCounts: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};

  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    const [agg] = db
      .select({
        tokens: sql<number>`COALESCE(SUM(${modelCalls.totalTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${modelCalls.estimatedCostUsd}), 0)`,
      })
      .from(modelCalls)
      .where(inArray(modelCalls.traceId, ids))
      .all();
    totalTokens = Number(agg?.tokens ?? 0);
    estimatedCostUsd = Number(agg?.cost ?? 0);

    const modelRows = db
      .select({ model: modelCalls.model, c: count() })
      .from(modelCalls)
      .where(inArray(modelCalls.traceId, ids))
      .groupBy(modelCalls.model)
      .all();
    for (const m of modelRows) modelCounts[m.model] = Number(m.c);

    const toolRows = db
      .select({ tool: toolCalls.toolName, c: count() })
      .from(toolCalls)
      .where(inArray(toolCalls.traceId, ids))
      .groupBy(toolCalls.toolName)
      .all();
    for (const t of toolRows) toolCounts[t.tool] = Number(t.c);
  }

  const errorCount = statusCounts["error"] ?? 0;
  const errorRate = total ? errorCount / total : 0;

  return {
    total,
    statusCounts,
    totalDurationMs,
    avgDurationMs,
    p95DurationMs,
    totalTokens,
    estimatedCostUsd,
    modelCounts,
    toolCounts,
    errorCount,
    errorRate,
  };
}

export async function getTraceDetail(traceId: string) {
  const db = getDatabase();

  const [trace] = await db.select().from(traces).where(eq(traces.id, traceId));
  if (!trace) {
    return null;
  }

  const traceEvents = await db
    .select()
    .from(events)
    .where(eq(events.traceId, traceId))
    .orderBy(events.timestamp);

  const traceSpans = await db
    .select()
    .from(spans)
    .where(eq(spans.traceId, traceId))
    .orderBy(spans.startedAt);

  const traceModelCalls = await db
    .select()
    .from(modelCalls)
    .where(eq(modelCalls.traceId, traceId));

  const traceToolCalls = await db
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.traceId, traceId));

  const annotation = await getAnnotation(traceId);

  // Assemble tree structure. We thread `children` into each row so a recursive
  // shape matches `TraceDetail.spans`. Drizzle infers the row type from
  // `traceSpans`; we extend it locally to avoid a leaky `any` here.
  type SpanRow = (typeof traceSpans)[number];
  type SpanNode = SpanRow & { children: SpanNode[] };

  const spanMap = new Map<string, SpanNode>();
  for (const span of traceSpans) {
    spanMap.set(span.id, { ...span, children: [] });
  }

  const rootSpans: SpanNode[] = [];
  for (const span of traceSpans) {
    const spanNode = spanMap.get(span.id);
    if (!spanNode) continue;
    if (span.parentId && spanMap.has(span.parentId)) {
      spanMap.get(span.parentId)!.children.push(spanNode);
    } else {
      rootSpans.push(spanNode);
    }
  }

  return {
    trace,
    events: traceEvents,
    spans: rootSpans,
    modelCalls: traceModelCalls,
    toolCalls: traceToolCalls,
    annotation,
  };
}

// ── Annotations ───────────────────────────────────────────────────────────────

function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = String(raw).trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export async function getAnnotation(traceId: string): Promise<Annotation | null> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(traceAnnotations)
    .where(eq(traceAnnotations.traceId, traceId));
  if (!row) return null;
  return {
    traceId: row.traceId,
    favorite: Boolean(row.favorite),
    note: row.note ?? null,
    tags: normalizeTags(row.tags),
    updatedAt: row.updatedAt,
  };
}

/**
 * Create or update the local annotation for a trace. Only the fields present in
 * `input` change; the rest are preserved. Returns `null` if the trace does not
 * exist (annotations are FK-bound to a real trace).
 */
export async function upsertAnnotation(
  traceId: string,
  input: AnnotationInput
): Promise<Annotation | null> {
  const db = getDatabase();
  const exists = db
    .select({ id: traces.id })
    .from(traces)
    .where(eq(traces.id, traceId))
    .all();
  if (exists.length === 0) return null;

  const current = await getAnnotation(traceId);
  const merged = {
    favorite: input.favorite ?? current?.favorite ?? false,
    note: input.note !== undefined ? input.note : current?.note ?? null,
    tags:
      input.tags !== undefined
        ? normalizeTags(input.tags)
        : current?.tags ?? [],
  };
  const updatedAt = Date.now();

  db.insert(traceAnnotations)
    .values({
      traceId,
      favorite: merged.favorite,
      note: merged.note,
      tags: merged.tags,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: traceAnnotations.traceId,
      set: {
        favorite: merged.favorite,
        note: merged.note,
        tags: merged.tags,
        updatedAt,
      },
    })
    .run();

  return { traceId, ...merged, updatedAt };
}

// ── Saved Views ───────────────────────────────────────────────────────────────

function rowToSavedView(row: typeof savedViews.$inferSelect): SavedView {
  return {
    id: row.id,
    name: row.name,
    filters: (row.filtersJson as TraceFilters | null) ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSavedViews(): Promise<SavedView[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(savedViews)
    .orderBy(desc(savedViews.updatedAt));
  return rows.map(rowToSavedView);
}

export async function createSavedView(
  name: string,
  filters: TraceFilters
): Promise<SavedView> {
  const db = getDatabase();
  const now = Date.now();
  const id = generateId();
  db.insert(savedViews)
    .values({
      id,
      name,
      filtersJson: filters as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { id, name, filters, createdAt: now, updatedAt: now };
}

export async function updateSavedView(
  id: string,
  patch: { name?: string; filters?: TraceFilters }
): Promise<SavedView | null> {
  const db = getDatabase();
  const [existing] = await db
    .select()
    .from(savedViews)
    .where(eq(savedViews.id, id));
  if (!existing) return null;

  const updatedAt = Date.now();
  const set: Record<string, unknown> = { updatedAt };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.filters !== undefined) set.filtersJson = patch.filters;

  db.update(savedViews).set(set).where(eq(savedViews.id, id)).run();

  return rowToSavedView({
    ...existing,
    name: patch.name ?? existing.name,
    filtersJson: (patch.filters ?? existing.filtersJson) as never,
    updatedAt,
  });
}

export async function deleteSavedView(id: string): Promise<boolean> {
  const db = getDatabase();
  const existing = db
    .select({ id: savedViews.id })
    .from(savedViews)
    .where(eq(savedViews.id, id))
    .all();
  if (existing.length === 0) return false;
  db.delete(savedViews).where(eq(savedViews.id, id)).run();
  return true;
}

// ── Compare ───────────────────────────────────────────────────────────────────

async function getCompareSummary(
  traceId: string
): Promise<CompareTraceSummary | null> {
  const db = getDatabase();
  const [trace] = await db.select().from(traces).where(eq(traces.id, traceId));
  if (!trace) return null;

  const [traceEvents, traceSpans, traceModelCalls, traceToolCalls, annotation] =
    await Promise.all([
      db.select().from(events).where(eq(events.traceId, traceId)),
      db.select().from(spans).where(eq(spans.traceId, traceId)),
      db.select().from(modelCalls).where(eq(modelCalls.traceId, traceId)),
      db.select().from(toolCalls).where(eq(toolCalls.traceId, traceId)),
      getAnnotation(traceId),
    ]);

  const totalTokens = traceModelCalls.reduce(
    (sum, m) => sum + (m.totalTokens ?? 0),
    0
  );
  const estimatedCostUsd = traceModelCalls.reduce(
    (sum, m) => sum + (m.estimatedCostUsd ?? 0),
    0
  );

  const errorCount =
    traceEvents.filter((e) => e.type === "error" || e.error != null).length +
    traceSpans.filter((s) => s.status === "error").length +
    traceToolCalls.filter((t) => t.status === "error").length;

  const models: Record<string, number> = {};
  for (const m of traceModelCalls) {
    models[m.model] = (models[m.model] ?? 0) + 1;
  }
  const tools: Record<string, number> = {};
  for (const t of traceToolCalls) {
    tools[t.toolName] = (tools[t.toolName] ?? 0) + 1;
  }

  return {
    trace: {
      id: trace.id,
      name: trace.name,
      status: trace.status,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      durationMs: trace.durationMs,
      favorite: annotation?.favorite ?? false,
      tags: annotation?.tags ?? [],
    },
    durationMs: trace.durationMs ?? 0,
    estimatedCostUsd,
    totalTokens,
    modelCallCount: traceModelCalls.length,
    toolCallCount: traceToolCalls.length,
    spanCount: traceSpans.length,
    eventCount: traceEvents.length,
    errorCount,
    models,
    tools,
  };
}

/** Spans aggregated by `kind:name` (sum of durations), for matched comparison. */
async function getSpanDurationMap(
  traceId: string
): Promise<Map<string, { kind: string; name: string; durationMs: number }>> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(spans)
    .where(eq(spans.traceId, traceId));
  const map = new Map<string, { kind: string; name: string; durationMs: number }>();
  for (const s of rows) {
    const key = `${s.kind}:${s.name}`;
    const prev = map.get(key);
    const dur = s.durationMs ?? 0;
    if (prev) prev.durationMs += dur;
    else map.set(key, { kind: s.kind, name: s.name, durationMs: dur });
  }
  return map;
}

function countDeltas(
  left: Record<string, number>,
  right: Record<string, number>
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys]
    .sort()
    .map((key) => {
      const l = left[key] ?? 0;
      const r = right[key] ?? 0;
      return { key, left: l, right: r, delta: r - l };
    });
}

/**
 * Compare two traces. Does not mutate trace data — computed purely from existing
 * rows plus local annotations. Returns `null` if either trace is missing.
 */
export async function compareTraces(
  leftId: string,
  rightId: string
): Promise<CompareResult | null> {
  const [left, right] = await Promise.all([
    getCompareSummary(leftId),
    getCompareSummary(rightId),
  ]);
  if (!left || !right) return null;

  const [leftSpans, rightSpans] = await Promise.all([
    getSpanDurationMap(leftId),
    getSpanDurationMap(rightId),
  ]);

  const spanKeys = new Set([...leftSpans.keys(), ...rightSpans.keys()]);
  const spanDeltas = [...spanKeys]
    .sort()
    .map((key) => {
      const l = leftSpans.get(key);
      const r = rightSpans.get(key);
      const meta = l ?? r!;
      const leftDurationMs = l ? l.durationMs : null;
      const rightDurationMs = r ? r.durationMs : null;
      const deltaMs =
        leftDurationMs != null && rightDurationMs != null
          ? rightDurationMs - leftDurationMs
          : null;
      return {
        key,
        kind: meta.kind,
        name: meta.name,
        leftDurationMs,
        rightDurationMs,
        deltaMs,
      };
    });

  return {
    left,
    right,
    deltas: {
      durationMs: right.durationMs - left.durationMs,
      estimatedCostUsd: right.estimatedCostUsd - left.estimatedCostUsd,
      totalTokens: right.totalTokens - left.totalTokens,
      errorCount: right.errorCount - left.errorCount,
      models: countDeltas(left.models, right.models),
      tools: countDeltas(left.tools, right.tools),
      spans: spanDeltas,
    },
  };
}

/**
 * An ingest batch item. We accept loose typing here because the SDK is the
 * source of truth for the wire shape; field validation happens during each
 * `tx.insert(...)` call. Keeping this `unknown` makes us explicit about the
 * fact that data crosses a process boundary.
 */
export type IngestBatchItem = {
  kind: string;
  data: Record<string, unknown>;
};

export async function insertBatchEvents(payload: {
  events: IngestBatchItem[];
}) {
  const db = getDatabase();
  const accepted: string[] = [];
  const errors: { index: number; message: string }[] = [];

  db.transaction((tx) => {
    for (let i = 0; i < payload.events.length; i++) {
      const item = payload.events[i];
      const kind = item.kind;
      // Treat each row as an opaque bag; per-branch field reads stay narrow.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = item.data as any;

      try {
        if (kind === "trace") {
          tx.insert(traces).values({
            id: data.id,
            name: data.name,
            status: data.status,
            startedAt: data.startedAt,
            input: data.input || null,
            metadata: data.metadata || null,
          }).onConflictDoNothing().run();
        } else if (kind === "trace.update") {
          tx.update(traces)
            .set({
              status: data.status,
              endedAt: data.endedAt,
              durationMs: data.durationMs,
              output: data.output || null,
              metadata: data.metadata || null,
            })
            .where(eq(traces.id, data.id))
            .run();
        } else if (kind === "event") {
          tx.insert(events).values({
            id: data.id,
            traceId: data.traceId,
            parentId: data.parentId,
            type: data.type,
            name: data.name,
            timestamp: data.timestamp,
            durationMs: data.durationMs,
            input: data.input || null,
            output: data.output || null,
            error: data.error || null,
            metadata: data.metadata || null,
          }).run();
        } else if (kind === "span") {
          tx.insert(spans).values({
            id: data.id,
            traceId: data.traceId,
            parentId: data.parentId,
            name: data.name,
            kind: data.kind,
            status: data.status,
            startedAt: data.startedAt,
            attributes: data.attributes || null,
          }).onConflictDoUpdate({
            target: spans.id,
            set: {
              status: data.status,
              endedAt: data.endedAt,
              durationMs: data.durationMs,
              attributes: data.attributes || null,
            }
          }).run();
        } else if (kind === "span.update") {
          tx.update(spans)
            .set({
              status: data.status,
              endedAt: data.endedAt,
              durationMs: data.durationMs,
              attributes: data.attributes || null,
            })
            .where(eq(spans.id, data.id))
            .run();
        } else if (kind === "model_call") {
          const cost = calculateCost(data.model, data.inputTokens || 0, data.outputTokens || 0);
          tx.insert(modelCalls).values({
            id: data.id,
            traceId: data.traceId,
            spanId: data.spanId,
            provider: data.provider,
            model: data.model,
            prompt: data.prompt || null,
            messages: data.messages || null,
            response: data.response || null,
            inputTokens: data.inputTokens || null,
            outputTokens: data.outputTokens || null,
            totalTokens: data.totalTokens || null,
            estimatedCostUsd: cost ?? null,
            startedAt: data.startedAt,
            endedAt: data.endedAt || null,
            durationMs: data.durationMs || null,
            metadata: data.metadata || null,
          }).run();
        } else if (kind === "tool_call") {
          tx.insert(toolCalls).values({
            id: data.id,
            traceId: data.traceId,
            spanId: data.spanId,
            toolName: data.toolName,
            input: data.input || null,
            output: data.output || null,
            status: data.status,
            startedAt: data.startedAt,
            endedAt: data.endedAt || null,
            durationMs: data.durationMs || null,
            error: data.error || null,
            metadata: data.metadata || null,
          }).run();
        }
        accepted.push(data.id);
      } catch (err: unknown) {
        errors.push({
          index: i,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  return { accepted, errors };
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete a trace and (via ON DELETE CASCADE) all of its events, spans, model
 * calls, and tool calls. Returns `false` if the trace did not exist.
 */
export async function deleteTrace(traceId: string): Promise<boolean> {
  const db = getDatabase();
  const existing = db
    .select({ id: traces.id })
    .from(traces)
    .where(eq(traces.id, traceId))
    .all();
  if (existing.length === 0) return false;
  db.delete(traces).where(eq(traces.id, traceId)).run();
  return true;
}

// ── Import ──────────────────────────────────────────────────────────────────

type ExportSpan = TraceExport["spans"][number];

/** Flatten a span tree (each node may carry `children`) into a flat list. */
function flattenSpans(input: ExportSpan[]): Array<Omit<ExportSpan, "children">> {
  const out: Array<Omit<ExportSpan, "children">> = [];
  const walk = (list: ExportSpan[] | undefined) => {
    for (const span of list ?? []) {
      const { children, ...rest } = span;
      out.push(rest);
      if (Array.isArray(children) && children.length) walk(children);
    }
  };
  walk(input);
  return out;
}

export interface ImportResult {
  ok: boolean;
  /** True when the trace already exists and `replace` was not requested. */
  conflict?: boolean;
  traceId: string;
}

/**
 * Import a self-contained trace bundle (as produced by the export endpoint).
 *
 * - Preserves `trace.id`.
 * - Returns `{ ok: false, conflict: true }` if the trace exists and `replace`
 *   is not set.
 * - With `replace`, deletes the existing trace (cascade) and re-imports.
 * - Flattens `spans` (which may be a tree) and inserts in FK-safe order:
 *   trace → spans → events → model calls → tool calls.
 */
export async function importTrace(
  bundle: TraceExport,
  options: { replace?: boolean } = {},
): Promise<ImportResult> {
  const db = getDatabase();
  const traceId = bundle.trace.id;

  const exists =
    db.select({ id: traces.id }).from(traces).where(eq(traces.id, traceId)).all()
      .length > 0;

  if (exists && !options.replace) {
    return { ok: false, conflict: true, traceId };
  }

  const flatSpans = flattenSpans(bundle.spans);

  db.transaction((tx) => {
    if (exists && options.replace) {
      tx.delete(traces).where(eq(traces.id, traceId)).run(); // cascade
    }

    const t = bundle.trace;
    tx.insert(traces)
      .values({
        id: t.id,
        name: t.name,
        status: t.status,
        startedAt: t.startedAt,
        endedAt: t.endedAt ?? null,
        durationMs: t.durationMs ?? null,
        input: t.input ?? null,
        output: t.output ?? null,
        metadata: (t.metadata as Record<string, unknown>) ?? null,
      })
      .run();

    for (const s of flatSpans) {
      tx.insert(spans)
        .values({
          id: s.id,
          traceId: s.traceId,
          parentId: s.parentId ?? null,
          name: s.name,
          kind: s.kind,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt ?? null,
          durationMs: s.durationMs ?? null,
          attributes: (s.attributes as Record<string, unknown>) ?? null,
        })
        .run();
    }

    for (const e of bundle.events) {
      tx.insert(events)
        .values({
          id: e.id,
          traceId: e.traceId,
          parentId: e.parentId ?? null,
          type: e.type,
          name: e.name,
          timestamp: e.timestamp,
          durationMs: e.durationMs ?? null,
          input: e.input ?? null,
          output: e.output ?? null,
          error: e.error ?? null,
          metadata: (e.metadata as Record<string, unknown>) ?? null,
        })
        .run();
    }

    for (const m of bundle.modelCalls) {
      tx.insert(modelCalls)
        .values({
          id: m.id,
          traceId: m.traceId,
          spanId: m.spanId ?? null,
          provider: m.provider,
          model: m.model,
          prompt: m.prompt ?? null,
          messages: m.messages ?? null,
          response: m.response ?? null,
          inputTokens: m.inputTokens ?? null,
          outputTokens: m.outputTokens ?? null,
          totalTokens: m.totalTokens ?? null,
          estimatedCostUsd: m.estimatedCostUsd ?? null,
          startedAt: m.startedAt,
          endedAt: m.endedAt ?? null,
          durationMs: m.durationMs ?? null,
          metadata: (m.metadata as Record<string, unknown>) ?? null,
        })
        .run();
    }

    for (const c of bundle.toolCalls) {
      tx.insert(toolCalls)
        .values({
          id: c.id,
          traceId: c.traceId,
          spanId: c.spanId ?? null,
          toolName: c.toolName,
          input: c.input ?? null,
          output: c.output ?? null,
          status: c.status,
          startedAt: c.startedAt,
          endedAt: c.endedAt ?? null,
          durationMs: c.durationMs ?? null,
          error: c.error ?? null,
          metadata: (c.metadata as Record<string, unknown>) ?? null,
        })
        .run();
    }
  });

  return { ok: true, traceId };
}