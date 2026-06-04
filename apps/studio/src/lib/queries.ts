import { eq, and, desc, count, sql, inArray, sum } from "drizzle-orm";
import { getDatabase } from "../db/connection";
import { traces, events, spans, modelCalls, toolCalls } from "../db/schema";
import { calculateCost, type TraceExport } from "@agent-replay/core";

export async function getTracesList(options: {
  limit: number;
  offset: number;
  status?: string;
}) {
  const db = getDatabase();
  const { limit, offset, status } = options;

  const whereConditions = status
    ? eq(traces.status, status as any)
    : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(traces)
    .where(whereConditions);

  const list = await db
    .select({
      id: traces.id,
      name: traces.name,
      status: traces.status,
      startedAt: traces.startedAt,
      endedAt: traces.endedAt,
      durationMs: traces.durationMs,
    })
    .from(traces)
    .where(whereConditions)
    .orderBy(desc(traces.startedAt))
    .limit(limit)
    .offset(offset);

  // Aggregate costs for listed traces
  const traceIds = list.map((t) => t.id);
  let costs: Record<string, number> = {};
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
      ...t,
      estimatedCostUsd: costs[t.id] ?? 0,
    })),
    total: totalResult?.count ?? 0,
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

  // Assemble tree structure
  const spanMap = new Map<string, any>();
  traceSpans.forEach((span) => {
    spanMap.set(span.id, { ...span, children: [] });
  });

  const rootSpans: any[] = [];
  traceSpans.forEach((span) => {
    const spanNode = spanMap.get(span.id);
    if (span.parentId && spanMap.has(span.parentId)) {
      spanMap.get(span.parentId).children.push(spanNode);
    } else {
      rootSpans.push(spanNode);
    }
  });

  return {
    trace,
    events: traceEvents,
    spans: rootSpans,
    modelCalls: traceModelCalls,
    toolCalls: traceToolCalls,
  };
}

export async function insertBatchEvents(payload: {
  events: any[];
}) {
  const db = getDatabase();
  const accepted: string[] = [];
  const errors: { index: number; message: string }[] = [];

  db.transaction((tx) => {
    for (let i = 0; i < payload.events.length; i++) {
      const item = payload.events[i];
      const kind = item.kind;
      const data = item.data;

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
      } catch (err: any) {
        errors.push({ index: i, message: err.message });
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