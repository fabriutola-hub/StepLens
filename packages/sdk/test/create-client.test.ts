import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import {
  createClient,
  HttpCollector,
  MemoryCollector,
  DEFAULT_ENDPOINT,
} from "../src/index.js";

// ── Mock ingest server ───────────────────────────────────────────────────────

function createMockServer(): Promise<{
  server: Server;
  port: number;
  requests: Array<{ method: string; url: string; body: string }>;
}> {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        requests.push({ method: req.method!, url: req.url!, body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, port, requests });
    });
  });
}

describe("createClient", () => {
  let server: Server;
  let port: number;
  let requests: Array<{ method: string; url: string; body: string }>;

  beforeAll(async () => {
    const mock = await createMockServer();
    server = mock.server;
    port = mock.port;
    requests = mock.requests;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    requests.length = 0;
    delete process.env.AGENT_REPLAY_ENDPOINT;
    delete process.env.AGENT_REPLAY_ENABLED;
  });

  afterEach(() => {
    delete process.env.AGENT_REPLAY_ENDPOINT;
    delete process.env.AGENT_REPLAY_ENABLED;
  });

  // ── Defaults ───────────────────────────────────────────────────────────────

  it("defaults to an HttpCollector pointed at localhost:3000", () => {
    const client = createClient();
    expect(client.collector).toBeInstanceOf(HttpCollector);
    expect(client.enabled).toBe(true);
    expect(DEFAULT_ENDPOINT).toBe("http://localhost:3000");
  });

  it("records to the endpoint passed via `endpoint`", async () => {
    const client = createClient({
      endpoint: `http://localhost:${port}`,
      http: { flushIntervalMs: 0 },
    });
    await client.run("endpoint-agent", async (trace) => {
      trace.startSpan("step", { kind: "tool" }).end();
    });
    await client.shutdown();

    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests.every((r) => r.url === "/api/ingest")).toBe(true);
    expect(requests.every((r) => r.method === "POST")).toBe(true);
  });

  // ── http.baseUrl backwards compatibility ─────────────────────────────────────

  it("still supports the advanced `http.baseUrl` option", async () => {
    const client = createClient({
      http: { baseUrl: `http://localhost:${port}`, flushIntervalMs: 0 },
    });
    expect(client.collector).toBeInstanceOf(HttpCollector);

    await client.run("compat-agent", async (trace) => {
      trace.log("hello");
    });
    await client.shutdown();

    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  it("prefers `endpoint` over `http.baseUrl` when both are given", async () => {
    const client = createClient({
      endpoint: `http://localhost:${port}`,
      http: { baseUrl: "http://localhost:9", flushIntervalMs: 0 },
    });
    await client.run("precedence-agent", async (trace) => {
      trace.log("hi");
    });
    await client.shutdown();
    // The reachable mock (endpoint) should have received the batch.
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  // ── Environment variables ────────────────────────────────────────────────────

  it("reads AGENT_REPLAY_ENDPOINT from the environment", async () => {
    process.env.AGENT_REPLAY_ENDPOINT = `http://localhost:${port}`;
    const client = createClient({ http: { flushIntervalMs: 0 } });
    await client.run("env-agent", async (trace) => {
      trace.log("from-env");
    });
    await client.shutdown();
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  it("disables recording when AGENT_REPLAY_ENABLED=false", () => {
    process.env.AGENT_REPLAY_ENABLED = "false";
    const client = createClient();
    expect(client.enabled).toBe(false);
    // Disabled clients avoid HTTP entirely.
    expect(client.collector).toBeInstanceOf(MemoryCollector);
  });

  it("does not record anything when disabled via option", () => {
    const collector = new MemoryCollector();
    const client = createClient({ collector, enabled: false });
    const trace = client.startTrace("nope");
    trace.end();
    expect(collector.traces.length).toBe(0);
  });

  // ── Shutdown ─────────────────────────────────────────────────────────────────

  it("shutdown() flushes the HTTP buffer and resolves", async () => {
    const client = createClient({
      endpoint: `http://localhost:${port}`,
      http: { flushIntervalMs: 0, batchSize: 1000 },
    });
    const trace = client.startTrace("shutdown-agent");
    trace.end();
    await client.shutdown();
    const collector = client.collector as HttpCollector;
    expect(collector.bufferSize).toBe(0);
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  it("shutdown() is a no-op for the MemoryCollector", async () => {
    const client = createClient({ collector: new MemoryCollector() });
    await expect(client.shutdown()).resolves.toBeUndefined();
  });
});
