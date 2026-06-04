import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDatabase } from "../../src/db/connection";
import * as schema from "../../src/db/schema.js";

beforeAll(() => {
  getDatabase({ path: ":memory:", wal: false, migrate: true });
});

const { POST: importPOST } = await import("../../src/app/api/import/route");
const { GET: exportGET } = await import("../../src/app/api/export/[traceId]/route");
const { GET: traceDetailGET, DELETE: traceDELETE } = await import(
  "../../src/app/api/traces/[traceId]/route"
);

const TRACE_ID = "imp-1";

const bundle = {
  version: "1.0.0",
  exportedAt: 1_700_000_000_000,
  trace: {
    id: TRACE_ID,
    name: "Imported Agent",
    status: "success",
    startedAt: 1000,
    endedAt: 1100,
    durationMs: 100,
    input: { q: "hi" },
    output: { a: "bye" },
  },
  events: [{ id: "e1", traceId: TRACE_ID, type: "log", name: "log1", timestamp: 1005 }],
  // Span tree — must be flattened on import.
  spans: [
    {
      id: "s-root",
      traceId: TRACE_ID,
      name: "root",
      kind: "agent",
      status: "success",
      startedAt: 1001,
      endedAt: 1099,
      durationMs: 98,
      children: [
        {
          id: "s-child",
          traceId: TRACE_ID,
          parentId: "s-root",
          name: "child",
          kind: "tool",
          status: "success",
          startedAt: 1010,
          endedAt: 1050,
          durationMs: 40,
        },
      ],
    },
  ],
  modelCalls: [
    {
      id: "m1",
      traceId: TRACE_ID,
      spanId: "s-root",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.0075,
      startedAt: 1011,
    },
  ],
  toolCalls: [
    {
      id: "t1",
      traceId: TRACE_ID,
      spanId: "s-child",
      toolName: "search",
      input: { q: "hi" },
      status: "success",
      startedAt: 1012,
    },
  ],
};

function importReq(body: unknown, replace = false): NextRequest {
  const url = `http://localhost:3000/api/import${replace ? "?replace=true" : ""}`;
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("import / export / delete", () => {
  it("imports a bundle, flattening the span tree", async () => {
    const res = await importPOST(importReq(bundle));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.traceId).toBe(TRACE_ID);

    // Both spans were inserted (flattened) with parent/child preserved.
    const detailRes = await traceDetailGET(
      new NextRequest(`http://localhost:3000/api/traces/${TRACE_ID}`),
      { params: Promise.resolve({ traceId: TRACE_ID }) },
    );
    const detail = await detailRes.json();
    expect(detail.spans).toHaveLength(1);
    expect(detail.spans[0].id).toBe("s-root");
    expect(detail.spans[0].children[0].id).toBe("s-child");
    expect(detail.modelCalls[0].estimatedCostUsd).toBeCloseTo(0.0075, 6);
    expect(detail.toolCalls).toHaveLength(1);
  });

  it("returns 409 on a duplicate import without replace", async () => {
    const res = await importPOST(importReq(bundle));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.traceId).toBe(TRACE_ID);
  });

  it("replaces an existing trace with ?replace=true", async () => {
    const replaced = { ...bundle, trace: { ...bundle.trace, name: "Renamed" } };
    const res = await importPOST(importReq(replaced, true));
    expect(res.status).toBe(200);

    const db = getDatabase();
    const rows = db.select().from(schema.traces).where(eq(schema.traces.id, TRACE_ID)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Renamed");
    // Children were re-imported, not duplicated.
    const spanRows = db.select().from(schema.spans).where(eq(schema.spans.traceId, TRACE_ID)).all();
    expect(spanRows).toHaveLength(2);
  });

  it("round-trips through export → import", async () => {
    const exportRes = await exportGET(
      new NextRequest(`http://localhost:3000/api/export/${TRACE_ID}`),
      { params: Promise.resolve({ traceId: TRACE_ID }) },
    );
    const exported = await exportRes.json();
    // Re-importing the exact export should succeed with replace.
    const res = await importPOST(importReq(exported, true));
    expect(res.status).toBe(200);
  });

  it("DELETE removes the trace and cascades to children", async () => {
    const delRes = await traceDELETE(
      new NextRequest(`http://localhost:3000/api/traces/${TRACE_ID}`),
      { params: Promise.resolve({ traceId: TRACE_ID }) },
    );
    expect(delRes.status).toBe(200);

    const detailRes = await traceDetailGET(
      new NextRequest(`http://localhost:3000/api/traces/${TRACE_ID}`),
      { params: Promise.resolve({ traceId: TRACE_ID }) },
    );
    expect(detailRes.status).toBe(404);

    // Cascade: children gone.
    const db = getDatabase();
    expect(db.select().from(schema.spans).where(eq(schema.spans.traceId, TRACE_ID)).all()).toHaveLength(0);
    expect(db.select().from(schema.modelCalls).where(eq(schema.modelCalls.traceId, TRACE_ID)).all()).toHaveLength(0);
    expect(db.select().from(schema.toolCalls).where(eq(schema.toolCalls.traceId, TRACE_ID)).all()).toHaveLength(0);
  });

  it("DELETE returns 404 for an unknown trace", async () => {
    const res = await traceDELETE(
      new NextRequest("http://localhost:3000/api/traces/nope"),
      { params: Promise.resolve({ traceId: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});
