import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { getDatabase } from "../../src/db/connection";

beforeAll(() => {
  getDatabase({ path: ":memory:", wal: false, migrate: true });
});

const { POST: ingestPOST } = await import("../../src/app/api/ingest/route");
const { GET: activityGET } = await import("../../src/app/api/activity/route");

async function ingestAt(id: string, startedAt: number) {
  await ingestPOST(
    new NextRequest("http://localhost:3000/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          { kind: "trace", data: { id, name: id, status: "success", startedAt } },
        ],
      }),
    })
  );
}

describe("GET /api/activity", () => {
  it("returns the histogram envelope", async () => {
    const res = await activityGET(new NextRequest("http://localhost:3000/api/activity"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      from: expect.any(Number),
      to: expect.any(Number),
      fromBucket: expect.any(Number),
      toBucket: expect.any(Number),
      tz: expect.any(Number),
      counts: expect.any(Object),
    });
  });

  it("counts a trace on its day", async () => {
    // Use `Date.now()` directly rather than `today + 12h` — the latter
    // races with the test runner if the test fires within minutes of UTC
    // midnight (the inserted trace ends up "tomorrow" relative to the
    // route's `to = Date.now()` snapshot, and the WHERE filter drops it).
    const startedAt = Date.now();
    const today = Math.floor(startedAt / 86_400_000) * 86_400_000;
    await ingestAt("heat-1", startedAt);

    const res = await activityGET(new NextRequest("http://localhost:3000/api/activity"));
    const body = await res.json();
    const bucket = Math.floor(today / 86_400_000);
    expect(body.counts[String(bucket)] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("clamps to at most 84 days in the past", async () => {
    const res = await activityGET(new NextRequest("http://localhost:3000/api/activity"));
    const body = await res.json();
    const span = body.to - body.from;
    expect(span).toBeGreaterThanOrEqual(83 * 86_400_000);
    expect(span).toBeLessThanOrEqual(85 * 86_400_000);
  });

  it("respects tz offset", async () => {
    const res = await activityGET(
      new NextRequest("http://localhost:3000/api/activity?tz=120")
    );
    const body = await res.json();
    expect(body.tz).toBe(120);
  });
});
