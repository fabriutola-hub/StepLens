import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { getDatabase } from "../../src/db/connection";

beforeAll(() => {
  getDatabase({ path: ":memory:", wal: false, migrate: true });
});

const { POST: bulkPOST } = await import("../../src/app/api/traces/bulk/route");

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/traces/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ingest(id: string, name: string) {
  const { POST: ingestPOST } = await import("../../src/app/api/ingest/route");
  await ingestPOST(
    new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          { kind: "trace", data: { id, name, status: "success", startedAt: Date.now() } },
        ],
      }),
    })
  );
}

describe("POST /api/traces/bulk", () => {
  it("rejects missing ids", async () => {
    const res = await bulkPOST(jsonRequest({ op: "delete" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty ids", async () => {
    const res = await bulkPOST(jsonRequest({ op: "delete", ids: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects non-string ids", async () => {
    const res = await bulkPOST(jsonRequest({ op: "delete", ids: [1, 2] }));
    expect(res.status).toBe(400);
  });

  it("rejects too many ids (>1000)", async () => {
    const res = await bulkPOST(
      jsonRequest({ op: "delete", ids: Array.from({ length: 1001 }, (_, i) => `id-${i}`) })
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown op", async () => {
    const res = await bulkPOST(jsonRequest({ op: "weird", ids: ["a"] }));
    expect(res.status).toBe(400);
  });

  it("deletes many traces at once", async () => {
    await ingest("bulk-1", "Bulk 1");
    await ingest("bulk-2", "Bulk 2");
    await ingest("bulk-3", "Bulk 3");

    const res = await bulkPOST(jsonRequest({ op: "delete", ids: ["bulk-1", "bulk-2", "bulk-3"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(3);
  });

  it("ignores missing ids in a delete (best-effort)", async () => {
    await ingest("bulk-keep", "Keep");
    const res = await bulkPOST(
      jsonRequest({ op: "delete", ids: ["bulk-keep", "bulk-missing"] })
    );
    const body = await res.json();
    expect(body.deleted).toBe(1);
  });

  it("adds and removes tags in bulk", async () => {
    await ingest("tag-1", "Tag 1");
    await ingest("tag-2", "Tag 2");

    const add = await bulkPOST(
      jsonRequest({ op: "tag", ids: ["tag-1", "tag-2"], tagOp: "add", tag: "prod" })
    );
    const addBody = await add.json();
    expect(addBody.written).toBe(2);

    const remove = await bulkPOST(
      jsonRequest({ op: "tag", ids: ["tag-1"], tagOp: "remove", tag: "prod" })
    );
    const removeBody = await remove.json();
    expect(removeBody.written).toBe(1);

    // Validate state via the annotation endpoint.
    const { GET: annotationGET } = await import(
      "../../src/app/api/traces/[traceId]/annotation/route"
    );
    const one = await annotationGET(
      new NextRequest(`http://localhost:3000/api/traces/tag-1/annotation`),
      { params: Promise.resolve({ traceId: "tag-1" }) }
    );
    const oneBody = await one.json();
    expect(oneBody.annotation.tags).not.toContain("prod");

    const two = await annotationGET(
      new NextRequest(`http://localhost:3000/api/traces/tag-2/annotation`),
      { params: Promise.resolve({ traceId: "tag-2" }) }
    );
    const twoBody = await two.json();
    expect(twoBody.annotation.tags).toContain("prod");
  });

  it("rejects tag op without a tag", async () => {
    const res = await bulkPOST(
      jsonRequest({ op: "tag", ids: ["tag-2"], tagOp: "add", tag: "  " })
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid tagOp value", async () => {
    const res = await bulkPOST(
      jsonRequest({ op: "tag", ids: ["tag-2"], tagOp: "weird", tag: "prod" })
    );
    expect(res.status).toBe(400);
  });
});
