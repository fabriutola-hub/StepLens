import { describe, it, expect, beforeAll } from "vitest";
import { getDatabase } from "../../src/db/connection";

// Spin up the in-memory DB before route imports — same pattern as routes.test.
beforeAll(() => {
  getDatabase({ path: ":memory:", wal: false, migrate: true });
});

const { GET: healthGET } = await import("../../src/app/api/health/route");

describe("/api/health", () => {
  it("returns 200 with the expected envelope when the DB is reachable", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();

    expect(body.status).toBe("ok");
    expect(body.service).toBe("steplens-studio");
    expect(typeof body.version).toBe("string");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof body.uptimeMs).toBe("number");
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof body.startedAt).toBe("number");
    expect(body.db.connected).toBe(true);
    expect(typeof body.db.traceCount).toBe("number");
    expect(body.db.traceCount).toBeGreaterThanOrEqual(0);
    expect(body.db.error).toBeUndefined();
  });

  it("uptime monotonically increases across calls", async () => {
    const first = await (await healthGET()).json();
    // A small sleep keeps this robust even on fast machines.
    await new Promise((r) => setTimeout(r, 5));
    const second = await (await healthGET()).json();
    expect(second.uptimeMs).toBeGreaterThanOrEqual(first.uptimeMs);
    expect(second.startedAt).toBe(first.startedAt);
  });
});
