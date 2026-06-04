import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { HttpCollector } from "../src/index.js";

function createMockServer(): Promise<{ server: Server; port: number; requests: Array<{ method: string; url: string; body: string }> }> {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        requests.push({ method: req.method!, url: req.url!, body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, () => {
      const port = (server.address() as any).port;
      resolve({ server, port, requests });
    });
  });
}

describe("HttpCollector", () => {
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

  it("buffers events and flushes on request", async () => {
    const collector = new HttpCollector({
      baseUrl: `http://localhost:${port}`,
      flushIntervalMs: 0,
      batchSize: 100,
    });

    collector.onEvent({
      id: "e-buf",
      traceId: "t1",
      type: "log",
      name: "buffered",
      timestamp: 1000,
    });

    await collector.shutdown();
    expect(collector.bufferSize).toBe(0);
  });

  it("tracks buffer size", () => {
    const collector = new HttpCollector({
      baseUrl: `http://localhost:${port}`,
      flushIntervalMs: 0,
      batchSize: 100,
    });
    expect(collector.bufferSize).toBe(0);
    collector.onEvent({ id: "e1", traceId: "t1", type: "log", name: "x", timestamp: 1 });
    expect(collector.bufferSize).toBe(1);
    collector.onEvent({ id: "e2", traceId: "t1", type: "log", name: "y", timestamp: 2 });
    expect(collector.bufferSize).toBe(2);
  });

  it("shutdown flushes and cleans up", async () => {
    const collector = new HttpCollector({
      baseUrl: `http://localhost:${port}`,
      flushIntervalMs: 0,
    });
    collector.onEvent({ id: "e-sd", traceId: "t1", type: "log", name: "final", timestamp: 1 });
    await collector.shutdown();
    expect(collector.bufferSize).toBe(0);
  });

  it("sends model call to API", async () => {
    const collector = new HttpCollector({
      baseUrl: `http://localhost:${port}`,
      flushIntervalMs: 0,
      batchSize: 1,
    });

    collector.onModelCall({
      id: "mc1",
      traceId: "t1",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      startedAt: 2000,
    });

    await collector.flush();
    // Wait for async fetch to complete
    await new Promise((r) => setTimeout(r, 300));
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  it("sends trace start event to API", async () => {
    const collector = new HttpCollector({
      baseUrl: `http://localhost:${port}`,
      flushIntervalMs: 0,
      batchSize: 1,
    });

    collector.onTraceStart({
      id: "t-flush",
      name: "test-trace",
      status: "running",
      startedAt: 1000,
    });

    await collector.flush();
    await new Promise((r) => setTimeout(r, 300));
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });
});
