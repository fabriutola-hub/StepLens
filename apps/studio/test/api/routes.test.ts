import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { getDatabase } from "../../src/db/connection";

// Initialize the shared DB singleton with an in-memory database BEFORE any
// route/query code runs. getDatabase() (no args) returns this cached instance.
beforeAll(() => {
  getDatabase({ path: ":memory:", wal: false, migrate: true });
});

// Import route handlers after the DB singleton is ready.
const { POST: ingestPOST } = await import("../../src/app/api/ingest/route");
const { GET: tracesGET } = await import("../../src/app/api/traces/route");
const { GET: traceDetailGET } = await import("../../src/app/api/traces/[traceId]/route");
const { GET: exportGET } = await import("../../src/app/api/export/[traceId]/route");

const TRACE_ID = "trace-api-test";

function ingestRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const startedAt = 1_700_000_000_000;

const batch = {
  events: [
    {
      kind: "trace",
      data: { id: TRACE_ID, name: "API Test Agent", status: "running", startedAt },
    },
    {
      kind: "span",
      data: {
        id: "span-1",
        traceId: TRACE_ID,
        name: "llm",
        kind: "model",
        status: "success",
        startedAt: startedAt + 1,
      },
    },
    {
      kind: "model_call",
      data: {
        id: "mc-1",
        traceId: TRACE_ID,
        spanId: "span-1",
        provider: "openai",
        model: "gpt-4o",
        inputTokens: 1000,
        outputTokens: 500,
        startedAt: startedAt + 2,
      },
    },
    {
      kind: "tool_call",
      data: {
        id: "tc-1",
        traceId: TRACE_ID,
        toolName: "search",
        input: { q: "hi" },
        status: "success",
        startedAt: startedAt + 3,
      },
    },
    {
      kind: "trace.update",
      data: { id: TRACE_ID, status: "success", endedAt: startedAt + 100, durationMs: 100 },
    },
  ],
};

describe("Studio API routes", () => {
  it("ingest accepts a valid batch and computes decimal cost", async () => {
    const res = await ingestPOST(ingestRequest(batch));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.inserted).toBe(5);
  });

  it("ingest rejects an invalid payload with 400", async () => {
    const res = await ingestPOST(ingestRequest({ not: "valid" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("traces list returns the ingested trace with aggregated decimal cost", async () => {
    const res = await tracesGET(new NextRequest("http://localhost:3000/api/traces?limit=50"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const trace = json.traces.find((t: { id: string }) => t.id === TRACE_ID);
    expect(trace).toBeDefined();
    expect(trace.status).toBe("success");
    // gpt-4o: 1000 in * 0.0025/1k + 500 out * 0.01/1k = 0.0025 + 0.005 = 0.0075
    expect(trace.estimatedCostUsd).toBeCloseTo(0.0075, 6);
  });

  it("trace detail returns spans, model calls, and tool calls", async () => {
    const res = await traceDetailGET(
      new NextRequest(`http://localhost:3000/api/traces/${TRACE_ID}`),
      { params: Promise.resolve({ traceId: TRACE_ID }) },
    );
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.trace.id).toBe(TRACE_ID);
    expect(detail.modelCalls).toHaveLength(1);
    expect(detail.modelCalls[0].estimatedCostUsd).toBeCloseTo(0.0075, 6);
    expect(detail.toolCalls).toHaveLength(1);
  });

  it("trace detail 404s for an unknown trace", async () => {
    const res = await traceDetailGET(
      new NextRequest("http://localhost:3000/api/traces/nope"),
      { params: Promise.resolve({ traceId: "nope" }) },
    );
    expect(res.status).toBe(404);
  });

  it("export returns JSON with version and decimal cost", async () => {
    const res = await exportGET(
      new NextRequest(`http://localhost:3000/api/export/${TRACE_ID}`),
      { params: Promise.resolve({ traceId: TRACE_ID }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(`trace-${TRACE_ID}.json`);
    const data = await res.json();
    expect(data.version).toBe("1.0.0");
    expect(data.exportedAt).toBeTypeOf("number");
    expect(typeof data.modelCalls[0].estimatedCostUsd).toBe("number");
    expect(data.modelCalls[0].estimatedCostUsd).toBeCloseTo(0.0075, 6);
  });

  it("export 404s for an unknown trace", async () => {
    const res = await exportGET(
      new NextRequest("http://localhost:3000/api/export/nope"),
      { params: Promise.resolve({ traceId: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});
