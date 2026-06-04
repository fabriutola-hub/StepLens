import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { getDatabase } from "../../src/db/connection";
import * as schema from "../../src/db/schema";

// In-memory DB singleton, migrated (so trace_annotations / saved_views exist).
beforeAll(() => {
  const db = getDatabase({ path: ":memory:", wal: false, migrate: true });

  // ── Trace A: success, fast, gpt-4o + search tool, favorited + tagged. ──
  db.insert(schema.traces)
    .values({
      id: "wb-a",
      name: "alpha agent",
      status: "success",
      startedAt: 1000,
      endedAt: 1100,
      durationMs: 100,
    })
    .run();
  db.insert(schema.spans)
    .values([
      {
        id: "a-root",
        traceId: "wb-a",
        name: "root",
        kind: "agent",
        status: "success",
        startedAt: 1001,
        endedAt: 1100,
        durationMs: 99,
      },
      {
        id: "a-search",
        traceId: "wb-a",
        parentId: "a-root",
        name: "search",
        kind: "tool",
        status: "success",
        startedAt: 1010,
        endedAt: 1050,
        durationMs: 40,
      },
    ])
    .run();
  db.insert(schema.modelCalls)
    .values({
      id: "a-mc",
      traceId: "wb-a",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 0.0075,
      startedAt: 1005,
      durationMs: 50,
    })
    .run();
  db.insert(schema.toolCalls)
    .values({
      id: "a-tc",
      traceId: "wb-a",
      toolName: "search",
      status: "success",
      startedAt: 1010,
      durationMs: 40,
    })
    .run();
  db.insert(schema.traceAnnotations)
    .values({
      traceId: "wb-a",
      favorite: true,
      tags: ["prod"],
      note: null,
      updatedAt: 1,
    })
    .run();

  // ── Trace B: error, slow, claude + fetch tool, with an error event. ──
  db.insert(schema.traces)
    .values({
      id: "wb-b",
      name: "beta agent",
      status: "error",
      startedAt: 2000,
      endedAt: 2300,
      durationMs: 300,
    })
    .run();
  db.insert(schema.spans)
    .values([
      {
        id: "b-root",
        traceId: "wb-b",
        name: "root",
        kind: "agent",
        status: "error",
        startedAt: 2001,
        endedAt: 2300,
        durationMs: 299,
      },
      {
        id: "b-search",
        traceId: "wb-b",
        parentId: "b-root",
        name: "search",
        kind: "tool",
        status: "error",
        startedAt: 2010,
        endedAt: 2100,
        durationMs: 90,
      },
    ])
    .run();
  db.insert(schema.modelCalls)
    .values({
      id: "b-mc",
      traceId: "wb-b",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      estimatedCostUsd: 0.01,
      startedAt: 2005,
      durationMs: 120,
    })
    .run();
  db.insert(schema.toolCalls)
    .values({
      id: "b-tc",
      traceId: "wb-b",
      toolName: "fetch",
      status: "error",
      startedAt: 2010,
      durationMs: 90,
    })
    .run();
  db.insert(schema.events)
    .values({
      id: "b-err",
      traceId: "wb-b",
      type: "error",
      name: "boom",
      timestamp: 2200,
    })
    .run();
});

const { GET: tracesGET } = await import("../../src/app/api/traces/route");
const { GET: statsGET } = await import("../../src/app/api/traces/stats/route");
const { GET: annotationGET, PUT: annotationPUT } = await import(
  "../../src/app/api/traces/[traceId]/annotation/route"
);
const { GET: viewsGET, POST: viewsPOST } = await import(
  "../../src/app/api/views/route"
);
const { PUT: viewPUT, DELETE: viewDELETE } = await import(
  "../../src/app/api/views/[id]/route"
);
const { GET: compareGET } = await import("../../src/app/api/compare/route");

function get(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}
function jsonReq(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/traces — advanced filters", () => {
  it("returns all traces with annotation fields by default", async () => {
    const json = await (await tracesGET(get("/api/traces"))).json();
    expect(json.total).toBe(2);
    // Default sort is startedAt desc → B (2000) before A (1000).
    expect(json.traces[0].id).toBe("wb-b");
    const a = json.traces.find((t: { id: string }) => t.id === "wb-a");
    expect(a.favorite).toBe(true);
    expect(a.tags).toEqual(["prod"]);
    expect(a.estimatedCostUsd).toBeCloseTo(0.0075, 6);
  });

  it("filters by status", async () => {
    const json = await (await tracesGET(get("/api/traces?status=error"))).json();
    expect(json.traces).toHaveLength(1);
    expect(json.traces[0].id).toBe("wb-b");
  });

  it("filters by model", async () => {
    const json = await (await tracesGET(get("/api/traces?model=gpt-4o"))).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-a"]);
  });

  it("filters by tool", async () => {
    const json = await (await tracesGET(get("/api/traces?tool=fetch"))).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-b"]);
  });

  it("filters by hasError", async () => {
    const json = await (await tracesGET(get("/api/traces?hasError=true"))).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-b"]);
  });

  it("filters by free-text query", async () => {
    const json = await (await tracesGET(get("/api/traces?q=alpha"))).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-a"]);
  });

  it("filters by favorite", async () => {
    const json = await (await tracesGET(get("/api/traces?favorite=true"))).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-a"]);
  });

  it("filters by tag", async () => {
    const json = await (await tracesGET(get("/api/traces?tag=prod"))).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-a"]);
  });

  it("sorts by duration ascending", async () => {
    const json = await (
      await tracesGET(get("/api/traces?sort=durationMs&order=asc"))
    ).json();
    expect(json.traces.map((t: { id: string }) => t.id)).toEqual(["wb-a", "wb-b"]);
  });

  it("paginates", async () => {
    const json = await (
      await tracesGET(get("/api/traces?limit=1&offset=0"))
    ).json();
    expect(json.total).toBe(2);
    expect(json.traces).toHaveLength(1);
  });
});

describe("GET /api/traces/stats", () => {
  it("aggregates the full population", async () => {
    const stats = await (await statsGET(get("/api/traces/stats"))).json();
    expect(stats.total).toBe(2);
    expect(stats.statusCounts).toEqual({ success: 1, error: 1 });
    expect(stats.errorCount).toBe(1);
    expect(stats.errorRate).toBeCloseTo(0.5, 6);
    expect(stats.totalDurationMs).toBe(400);
    expect(stats.avgDurationMs).toBe(200);
    expect(stats.p95DurationMs).toBe(300);
    expect(stats.totalTokens).toBe(1800);
    expect(stats.estimatedCostUsd).toBeCloseTo(0.0175, 6);
    expect(stats.modelCounts).toEqual({ "gpt-4o": 1, "claude-3-5-sonnet": 1 });
    expect(stats.toolCounts).toEqual({ search: 1, fetch: 1 });
  });

  it("respects filters", async () => {
    const stats = await (
      await statsGET(get("/api/traces/stats?status=error"))
    ).json();
    expect(stats.total).toBe(1);
    expect(stats.totalTokens).toBe(300);
    expect(stats.modelCounts).toEqual({ "claude-3-5-sonnet": 1 });
    expect(stats.errorRate).toBeCloseTo(1, 6);
  });
});

describe("trace annotations", () => {
  it("creates and merges annotation fields", async () => {
    const put = await annotationPUT(
      jsonReq("/api/traces/wb-b/annotation", "PUT", {
        favorite: false,
        tags: ["beta", "beta"], // de-duplicated
        note: "needs a fix",
      }),
      { params: Promise.resolve({ traceId: "wb-b" }) }
    );
    expect(put.status).toBe(200);
    const { annotation } = await put.json();
    expect(annotation.favorite).toBe(false);
    expect(annotation.tags).toEqual(["beta"]);
    expect(annotation.note).toBe("needs a fix");
  });

  it("preserves untouched fields on partial update", async () => {
    await annotationPUT(
      jsonReq("/api/traces/wb-b/annotation", "PUT", { favorite: true }),
      { params: Promise.resolve({ traceId: "wb-b" }) }
    );
    const res = await annotationGET(get("/api/traces/wb-b/annotation"), {
      params: Promise.resolve({ traceId: "wb-b" }),
    });
    const { annotation } = await res.json();
    expect(annotation.favorite).toBe(true);
    expect(annotation.tags).toEqual(["beta"]); // unchanged
    expect(annotation.note).toBe("needs a fix"); // unchanged
  });

  it("404s when annotating a missing trace", async () => {
    const res = await annotationPUT(
      jsonReq("/api/traces/nope/annotation", "PUT", { favorite: true }),
      { params: Promise.resolve({ traceId: "nope" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("saved views", () => {
  it("creates, lists, updates, and deletes", async () => {
    const created = await viewsPOST(
      jsonReq("/api/views", "POST", {
        name: "Errors",
        filters: { status: "error", hasError: true },
      })
    );
    expect(created.status).toBe(201);
    const { view } = await created.json();
    expect(view.id).toBeTruthy();
    expect(view.name).toBe("Errors");
    expect(view.filters.status).toBe("error");

    const list = await (await viewsGET()).json();
    expect(list.views.some((v: { id: string }) => v.id === view.id)).toBe(true);

    const updated = await viewPUT(
      jsonReq(`/api/views/${view.id}`, "PUT", { name: "Failed runs" }),
      { params: Promise.resolve({ id: view.id }) }
    );
    expect((await updated.json()).view.name).toBe("Failed runs");

    const del = await viewDELETE(get(`/api/views/${view.id}`), {
      params: Promise.resolve({ id: view.id }),
    });
    expect(del.status).toBe(200);

    const after = await (await viewsGET()).json();
    expect(after.views.some((v: { id: string }) => v.id === view.id)).toBe(false);
  });

  it("rejects a nameless view", async () => {
    const res = await viewsPOST(jsonReq("/api/views", "POST", { filters: {} }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/compare", () => {
  it("computes deltas between two traces", async () => {
    const res = await compareGET(get("/api/compare?left=wb-a&right=wb-b"));
    expect(res.status).toBe(200);
    const result = await res.json();

    expect(result.left.trace.id).toBe("wb-a");
    expect(result.right.trace.id).toBe("wb-b");
    expect(result.deltas.durationMs).toBe(200);
    expect(result.deltas.totalTokens).toBe(-1200);
    expect(result.deltas.estimatedCostUsd).toBeCloseTo(0.0025, 6);
    // B has 1 error event + 2 error spans + 1 error tool = 4; A has 0.
    expect(result.deltas.errorCount).toBe(4);

    const search = result.deltas.spans.find(
      (s: { key: string }) => s.key === "tool:search"
    );
    expect(search.leftDurationMs).toBe(40);
    expect(search.rightDurationMs).toBe(90);
    expect(search.deltaMs).toBe(50);

    const gpt = result.deltas.models.find(
      (m: { key: string }) => m.key === "gpt-4o"
    );
    expect(gpt).toEqual({ key: "gpt-4o", left: 1, right: 0, delta: -1 });
  });

  it("400s without both ids", async () => {
    const res = await compareGET(get("/api/compare?left=wb-a"));
    expect(res.status).toBe(400);
  });

  it("404s when a trace is missing", async () => {
    const res = await compareGET(get("/api/compare?left=wb-a&right=nope"));
    expect(res.status).toBe(404);
  });
});
