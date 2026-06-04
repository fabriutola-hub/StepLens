import { describe, it, expect } from "vitest";
import {
  toOtlpTrace,
  deriveTraceId,
  deriveSpanId,
  resolveOtlpEndpoint,
  type OtlpTracePayload,
} from "../src/index.js";
import type { TraceExport } from "@agent-replay/core";

// ── Test fixture ────────────────────────────────────────────────────────────

function makeTraceExport(overrides?: Partial<TraceExport>): TraceExport {
  return {
    version: "1.0.0",
    exportedAt: 1700000000000,
    trace: {
      id: "trace-1",
      name: "Test Agent",
      status: "success",
      startedAt: 1700000000000,
      endedAt: 1700000005000,
      durationMs: 5000,
    },
    events: [
      {
        id: "evt-1",
        traceId: "trace-1",
        type: "log",
        name: "info log",
        timestamp: 1700000001000,
      },
      {
        id: "evt-2",
        traceId: "trace-1",
        type: "error",
        name: "oops",
        timestamp: 1700000002000,
        error: { name: "TypeError", message: "something broke", stack: "at foo:1:2" },
      },
    ],
    spans: [
      {
        id: "span-1",
        traceId: "trace-1",
        name: "search",
        kind: "agent",
        status: "success",
        startedAt: 1700000000500,
        endedAt: 1700000003000,
        durationMs: 2500,
        attributes: { custom: "value" },
      },
    ],
    modelCalls: [
      {
        id: "mc-1",
        traceId: "trace-1",
        provider: "openai",
        model: "gpt-4o",
        prompt: "Hello world",
        messages: [{ role: "user", content: "Hello" }],
        response: "Hi there!",
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        estimatedCostUsd: 0.001,
        startedAt: 1700000001000,
        endedAt: 1700000002000,
        durationMs: 1000,
      },
    ],
    toolCalls: [
      {
        id: "tc-1",
        traceId: "trace-1",
        toolName: "calculator",
        input: { expression: "2+2" },
        output: { result: 4 },
        status: "success",
        startedAt: 1700000002500,
        endedAt: 1700000003000,
        durationMs: 500,
      },
      {
        id: "tc-2",
        traceId: "trace-1",
        toolName: "failing_tool",
        input: { x: 1 },
        status: "error",
        startedAt: 1700000003500,
        endedAt: 1700000004000,
        durationMs: 500,
        error: { name: "ToolError", message: "tool failed" },
      },
    ],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("deriveTraceId", () => {
  it("returns a 32-hex string", () => {
    const id = deriveTraceId("trace-1");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic", () => {
    expect(deriveTraceId("trace-1")).toBe(deriveTraceId("trace-1"));
  });

  it("different inputs produce different IDs", () => {
    expect(deriveTraceId("trace-1")).not.toBe(deriveTraceId("trace-2"));
  });
});

describe("deriveSpanId", () => {
  it("returns a 16-hex string", () => {
    const id = deriveSpanId("span-1");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(deriveSpanId("span-1")).toBe(deriveSpanId("span-1"));
  });
});

describe("toOtlpTrace — structure", () => {
  it("produces a valid OTLP payload", () => {
    const payload = toOtlpTrace(makeTraceExport());

    expect(payload.resourceSpans).toHaveLength(1);
    const rs = payload.resourceSpans[0];

    // Resource attributes
    const svcName = rs.resource.attributes.find((a) => a.key === "service.name");
    expect(svcName).toBeDefined();
    expect(svcName!.value).toEqual({ stringValue: "steplens" });

    // Scope
    expect(rs.scopeSpans).toHaveLength(1);
    expect(rs.scopeSpans[0].scope.name).toBe("@agent-replay/otel");
  });

  it("creates root span + spans for trace spans, model calls, and tool calls", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    // 1 root + 1 span + 1 model call + 2 tool calls = 5
    expect(spans).toHaveLength(5);

    // First span is root
    const root = spans[0];
    expect(root.name).toBe("Test Agent");
    expect(root.parentSpanId).toBeUndefined();

    // All spans share the same traceId
    const traceIds = new Set(spans.map((s) => s.traceId));
    expect(traceIds.size).toBe(1);
  });

  it("uses deterministic IDs", () => {
    const a = toOtlpTrace(makeTraceExport());
    const b = toOtlpTrace(makeTraceExport());

    const spansA = a.resourceSpans[0].scopeSpans[0].spans;
    const spansB = b.resourceSpans[0].scopeSpans[0].spans;

    expect(spansA.map((s) => s.spanId)).toEqual(spansB.map((s) => s.spanId));
    expect(spansA[0].traceId).toBe(spansB[0].traceId);
  });
});

describe("toOtlpTrace — status mapping", () => {
  it("maps success to OK (1)", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const root = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(root.status.code).toBe(1); // OK
  });

  it("maps error to ERROR (2)", () => {
    const payload = toOtlpTrace(
      makeTraceExport({
        trace: {
          id: "trace-err",
          name: "Failing",
          status: "error",
          startedAt: 1700000000000,
          endedAt: 1700000001000,
        },
      }),
    );
    const root = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(root.status.code).toBe(2); // ERROR
  });

  it("maps cancelled to ERROR with steplens.cancelled attribute", () => {
    const payload = toOtlpTrace(
      makeTraceExport({
        trace: {
          id: "trace-cancel",
          name: "Cancelled",
          status: "cancelled",
          startedAt: 1700000000000,
          endedAt: 1700000001000,
        },
      }),
    );
    const root = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(root.status.code).toBe(2);
    const cancelled = root.attributes.find((a) => a.key === "steplens.cancelled");
    expect(cancelled).toBeDefined();
    expect(cancelled!.value).toEqual({ boolValue: true });
  });

  it("maps running to UNSET (0)", () => {
    const payload = toOtlpTrace(
      makeTraceExport({
        trace: {
          id: "trace-run",
          name: "Running",
          status: "running",
          startedAt: 1700000000000,
        },
      }),
    );
    const root = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(root.status.code).toBe(0); // UNSET
  });
});

describe("toOtlpTrace — content filtering", () => {
  it("does NOT include prompts/responses by default", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    // Find the model call span
    const mcSpan = spans.find((s) => s.name.startsWith("model:"));
    expect(mcSpan).toBeDefined();

    const prompt = mcSpan!.attributes.find((a) => a.key === "gen_ai.prompt");
    const completion = mcSpan!.attributes.find((a) => a.key === "gen_ai.completion");
    expect(prompt).toBeUndefined();
    expect(completion).toBeUndefined();
  });

  it("includes prompts/responses when includeContent is true", () => {
    const payload = toOtlpTrace(makeTraceExport(), { includeContent: true });
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    const mcSpan = spans.find((s) => s.name.startsWith("model:"));
    expect(mcSpan).toBeDefined();

    const prompt = mcSpan!.attributes.find((a) => a.key === "gen_ai.prompt");
    const completion = mcSpan!.attributes.find((a) => a.key === "gen_ai.completion");
    expect(prompt).toBeDefined();
    expect(prompt!.value).toEqual({ stringValue: "Hello world" });
    expect(completion).toBeDefined();
    expect(completion!.value).toEqual({ stringValue: "Hi there!" });
  });

  it("does NOT include tool input/output by default", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    const tcSpan = spans.find((s) => s.name === "tool:calculator");
    expect(tcSpan).toBeDefined();

    const input = tcSpan!.attributes.find((a) => a.key === "steplens.tool.input");
    expect(input).toBeUndefined();
  });

  it("includes tool input/output when includeContent is true", () => {
    const payload = toOtlpTrace(makeTraceExport(), { includeContent: true });
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    const tcSpan = spans.find((s) => s.name === "tool:calculator");
    expect(tcSpan).toBeDefined();

    const input = tcSpan!.attributes.find((a) => a.key === "steplens.tool.input");
    expect(input).toBeDefined();
  });
});

describe("toOtlpTrace — GenAI attributes", () => {
  it("sets gen_ai.system and gen_ai.request.model on model call spans", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    const mcSpan = spans.find((s) => s.name.startsWith("model:"));
    expect(mcSpan).toBeDefined();

    const system = mcSpan!.attributes.find((a) => a.key === "gen_ai.system");
    expect(system!.value).toEqual({ stringValue: "openai" });

    const model = mcSpan!.attributes.find((a) => a.key === "gen_ai.request.model");
    expect(model!.value).toEqual({ stringValue: "gpt-4o" });

    const inputTokens = mcSpan!.attributes.find((a) => a.key === "gen_ai.usage.input_tokens");
    expect(inputTokens!.value).toEqual({ intValue: "10" });

    const cost = mcSpan!.attributes.find((a) => a.key === "gen_ai.cost.usd");
    expect(cost!.value).toEqual({ doubleValue: 0.001 });
  });
});

describe("toOtlpTrace — events", () => {
  it("converts trace events to root span events", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const root = payload.resourceSpans[0].scopeSpans[0].spans[0];

    expect(root.events).toBeDefined();
    expect(root.events!.length).toBeGreaterThanOrEqual(2);

    // Log event
    const logEvt = root.events!.find((e) => e.name === "info log");
    expect(logEvt).toBeDefined();

    // Error event
    const errEvt = root.events!.find((e) => e.name === "exception");
    expect(errEvt).toBeDefined();
    const excType = errEvt!.attributes?.find((a) => a.key === "exception.type");
    expect(excType!.value).toEqual({ stringValue: "TypeError" });
  });
});

describe("toOtlpTrace — tool call errors", () => {
  it("maps error tool calls to ERROR status with exception attributes", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    const tcSpan = spans.find((s) => s.name === "tool:failing_tool");
    expect(tcSpan).toBeDefined();
    expect(tcSpan!.status.code).toBe(2); // ERROR

    const excType = tcSpan!.attributes.find((a) => a.key === "exception.type");
    expect(excType!.value).toEqual({ stringValue: "ToolError" });
  });
});

describe("toOtlpTrace — span tree flattening", () => {
  it("flattens nested span children", () => {
    const traceExport = makeTraceExport({
      spans: [
        {
          id: "parent-span",
          traceId: "trace-1",
          name: "parent",
          kind: "agent",
          status: "success",
          startedAt: 1700000000000,
          endedAt: 1700000004000,
          children: [
            {
              id: "child-span",
              traceId: "trace-1",
              parentId: "parent-span",
              name: "child",
              kind: "tool",
              status: "success",
              startedAt: 1700000001000,
              endedAt: 1700000002000,
            },
          ],
        },
      ],
    });

    const payload = toOtlpTrace(traceExport);
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;

    // root + parent + child + 1 model call + 2 tool calls = 6
    expect(spans).toHaveLength(6);

    // Child should have parent's OTel spanId as parentSpanId
    const childOtel = spans.find((s) =>
      s.attributes.some((a) => a.key === "steplens.span.id" && "stringValue" in a.value && a.value.stringValue === "child-span"),
    );
    expect(childOtel).toBeDefined();
    expect(childOtel!.parentSpanId).toBeDefined();
  });
});

describe("resolveOtlpEndpoint", () => {
  it("uses explicit endpoint when provided", () => {
    expect(resolveOtlpEndpoint("http://custom:4318/v1/traces")).toBe(
      "http://custom:4318/v1/traces",
    );
  });

  it("falls back to localhost:4318", () => {
    const prev1 = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    const prev2 = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    expect(resolveOtlpEndpoint()).toBe("http://localhost:4318/v1/traces");

    // Restore
    if (prev1) process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = prev1;
    if (prev2) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prev2;
  });

  it("uses OTEL_EXPORTER_OTLP_TRACES_ENDPOINT env var", () => {
    const prev = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://env-traces:4318/v1/traces";

    expect(resolveOtlpEndpoint()).toBe("http://env-traces:4318/v1/traces");

    if (prev) process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = prev;
    else delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  });

  it("uses OTEL_EXPORTER_OTLP_ENDPOINT + /v1/traces", () => {
    const prev1 = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    const prev2 = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";

    expect(resolveOtlpEndpoint()).toBe("http://collector:4318/v1/traces");

    if (prev1) process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = prev1;
    if (prev2) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prev2;
    else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });
});

describe("toOtlpTrace — OTLP JSON snapshot", () => {
  it("produces a stable structural snapshot", () => {
    const payload = toOtlpTrace(makeTraceExport());
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json) as OtlpTracePayload;

    // Verify top-level structure
    expect(parsed.resourceSpans).toHaveLength(1);
    expect(parsed.resourceSpans[0].scopeSpans).toHaveLength(1);

    const spans = parsed.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.length).toBeGreaterThan(0);

    // Every span must have required fields
    for (const span of spans) {
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(span.name).toBeTruthy();
      expect(typeof span.kind).toBe("number");
      expect(span.startTimeUnixNano).toBeTruthy();
      expect(span.endTimeUnixNano).toBeTruthy();
      expect(typeof span.status.code).toBe("number");
    }
  });
});

describe("sendOtlpTrace — integration with fake collector", () => {
  it("sends OTLP JSON to the collector", async () => {
    // Create a fake HTTP server to receive OTLP
    const { createServer } = await import("node:http");

    let receivedBody: string | null = null;
    let receivedContentType: string | null = null;

    const server = createServer((req, res) => {
      receivedContentType = req.headers["content-type"] ?? null;
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        receivedBody = body;
        res.writeHead(200);
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      throw new Error("Failed to get server address");
    }
    const port = addr.port;
    const endpoint = `http://127.0.0.1:${port}/v1/traces`;

    try {
      const { sendOtlpTrace } = await import("../src/index.js");
      const res = await sendOtlpTrace(makeTraceExport(), { otlpEndpoint: endpoint });

      expect(res.ok).toBe(true);
      expect(receivedContentType).toBe("application/json");

      // Parse and validate the received body
      const parsed = JSON.parse(receivedBody!) as OtlpTracePayload;
      expect(parsed.resourceSpans).toBeDefined();
      expect(parsed.resourceSpans).toHaveLength(1);
      expect(parsed.resourceSpans[0].scopeSpans[0].spans.length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});
