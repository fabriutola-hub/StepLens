// @agent-replay/otel — OTLP mapping utilities
//
// Converts a StepLens TraceExport into OTLP/HTTP JSON (protobuf-compatible
// JSON encoding per https://opentelemetry.io/docs/specs/otlp/).

import type { TraceExport } from "@agent-replay/core";
import { CORE_VERSION } from "@agent-replay/core";
import { createHash } from "node:crypto";

// ── Public types ────────────────────────────────────────────────────────────

export interface OtelBridgeOptions {
  /** Include prompt/response/tool input-output content (opt-in, off by default). */
  includeContent?: boolean;
  /** Override the service.name resource attribute. */
  serviceName?: string;
}

/** Minimal OTLP ExportTraceServiceRequest JSON shape. */
export interface OtlpTracePayload {
  resourceSpans: ResourceSpan[];
}

// ── OTLP JSON types (subset used by the bridge) ─────────────────────────────

export interface ResourceSpan {
  resource: { attributes: OtlpAttribute[] };
  scopeSpans: ScopeSpan[];
}

export interface ScopeSpan {
  scope: { name: string; version: string };
  spans: OtlpSpan[];
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT
  startTimeUnixNano: string; // uint64 as decimal string
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  events?: OtlpEvent[];
  status: OtlpStatus;
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
}

export interface OtlpAttribute {
  key: string;
  value: OtlpValue;
}

export type OtlpValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

export interface OtlpEvent {
  timeUnixNano: string;
  name: string;
  attributes?: OtlpAttribute[];
}

export interface OtlpStatus {
  code: number; // 0=UNSET, 1=OK, 2=ERROR
  message?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const OTEL_SCOPE_NAME = "@agent-replay/otel";
const OTEL_SCOPE_VERSION = CORE_VERSION;

// OTel span kind
const SPAN_KIND_INTERNAL = 1;

// OTel status codes
const STATUS_UNSET = 0;
const STATUS_OK = 1;
const STATUS_ERROR = 2;

// ── Deterministic ID derivation ─────────────────────────────────────────────

/**
 * Derive a 32-hex OTel traceId from a StepLens ID using SHA-256.
 */
export function deriveTraceId(input: string): string {
  return createHash("sha256").update(`trace:${input}`).digest("hex").slice(0, 32);
}

/**
 * Derive a 16-hex OTel spanId from a StepLens ID using SHA-256.
 */
export function deriveSpanId(input: string): string {
  return createHash("sha256").update(`span:${input}`).digest("hex").slice(0, 16);
}

// ── Time conversion ─────────────────────────────────────────────────────────

/** Convert epoch milliseconds to OTLP nanosecond string (uint64). */
function msToNano(ms: number | undefined | null): string {
  if (ms == null) return "0";
  return String(BigInt(Math.round(ms)) * 1_000_000n);
}

// ── Attribute helpers ────────────────────────────────────────────────────────

function strAttr(key: string, value: string | undefined | null): OtlpAttribute | null {
  if (value == null || value === "") return null;
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number | undefined | null): OtlpAttribute | null {
  if (value == null) return null;
  return { key, value: { intValue: String(value) } };
}

function doubleAttr(key: string, value: number | undefined | null): OtlpAttribute | null {
  if (value == null) return null;
  return { key, value: { doubleValue: value } };
}

function boolAttr(key: string, value: boolean): OtlpAttribute {
  return { key, value: { boolValue: value } };
}

function compact<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((v): v is T => v != null);
}

// ── Status mapping ──────────────────────────────────────────────────────────

function mapTraceStatus(status: string): OtlpStatus {
  switch (status) {
    case "success":
      return { code: STATUS_OK };
    case "error":
      return { code: STATUS_ERROR, message: "trace ended with error" };
    case "cancelled":
      return { code: STATUS_ERROR, message: "trace was cancelled" };
    default: // running, unknown
      return { code: STATUS_UNSET };
  }
}

function mapSpanStatus(status: string): OtlpStatus {
  switch (status) {
    case "success":
      return { code: STATUS_OK };
    case "error":
      return { code: STATUS_ERROR };
    default:
      return { code: STATUS_UNSET };
  }
}

function mapToolCallStatus(status: string): OtlpStatus {
  switch (status) {
    case "success":
      return { code: STATUS_OK };
    case "error":
      return { code: STATUS_ERROR };
    default:
      return { code: STATUS_UNSET };
  }
}

// ── Flatten span tree ────────────────────────────────────────────────────────

interface FlatSpan {
  id: string;
  traceId: string;
  parentId?: string | null;
  name: string;
  kind: string;
  status: string;
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
  attributes?: Record<string, unknown> | null;
}

function flattenSpans(spans: TraceExport["spans"]): FlatSpan[] {
  const result: FlatSpan[] = [];
  function walk(s: any) {
    result.push({
      id: s.id,
      traceId: s.traceId,
      parentId: s.parentId ?? null,
      name: s.name,
      kind: s.kind,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt ?? null,
      durationMs: s.durationMs ?? null,
      attributes: s.attributes ?? null,
    });
    if (Array.isArray(s.children)) {
      for (const child of s.children) walk(child);
    }
  }
  for (const s of spans) walk(s);
  return result;
}

// ── Main conversion ─────────────────────────────────────────────────────────

/**
 * Convert a StepLens TraceExport into an OTLP ExportTraceServiceRequest JSON
 * payload suitable for OTLP/HTTP JSON transport.
 */
export function toOtlpTrace(
  traceExport: TraceExport,
  options?: OtelBridgeOptions,
): OtlpTracePayload {
  const includeContent = options?.includeContent ?? false;
  const serviceName = options?.serviceName ?? "steplens";
  const { trace, events, modelCalls, toolCalls } = traceExport;
  const flatSpans = flattenSpans(traceExport.spans);

  const traceId = deriveTraceId(trace.id);
  const rootSpanId = deriveSpanId(`root:${trace.id}`);

  const allOtelSpans: OtlpSpan[] = [];

  // ── Root span ───────────────────────────────────────────────────────────────
  const rootAttrs = compact<OtlpAttribute>([
    strAttr("steplens.trace.id", trace.id),
    strAttr("steplens.trace.status", trace.status),
  ]);

  if (trace.status === "cancelled") {
    rootAttrs.push(boolAttr("steplens.cancelled", true));
  }

  const rootSpan: OtlpSpan = {
    traceId,
    spanId: rootSpanId,
    name: trace.name || "steplens.trace",
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: msToNano(trace.startedAt),
    endTimeUnixNano: msToNano(trace.endedAt ?? trace.startedAt),
    attributes: rootAttrs,
    status: mapTraceStatus(trace.status),
    events: [],
  };

  // ── Map events/logs/errors onto root span events ────────────────────────────
  const rootEvents: OtlpEvent[] = [];
  for (const evt of events) {
    const evtAttrs = compact<OtlpAttribute>([
      strAttr("steplens.event.id", evt.id),
      strAttr("steplens.event.type", evt.type),
    ]);
    if (includeContent && evt.input != null) {
      const a = strAttr("steplens.event.input", safeStringify(evt.input));
      if (a) evtAttrs.push(a);
    }
    if (includeContent && evt.output != null) {
      const a = strAttr("steplens.event.output", safeStringify(evt.output));
      if (a) evtAttrs.push(a);
    }
    if (evt.error) {
      const err = evt.error as { name?: string; message?: string; stack?: string };
      evtAttrs.push(
        ...compact<OtlpAttribute>([
          strAttr("exception.type", err.name ?? "Error"),
          strAttr("exception.message", err.message ?? ""),
          err.stack ? strAttr("exception.stacktrace", err.stack) : null,
        ]),
      );
    }
    rootEvents.push({
      timeUnixNano: msToNano(evt.timestamp),
      name: evt.error ? "exception" : evt.name || evt.type,
      attributes: evtAttrs,
    });
  }
  if (rootEvents.length > 0) rootSpan.events = rootEvents;
  allOtelSpans.push(rootSpan);

  // ── Build a lookup: spanId → parent OTel spanId ─────────────────────────────
  const spanIdToOtelSpanId = new Map<string, string>();
  spanIdToOtelSpanId.set(trace.id, rootSpanId); // trace itself maps to root

  // ── StepLens spans ──────────────────────────────────────────────────────────
  for (const span of flatSpans) {
    const otelSpanId = deriveSpanId(span.id);
    spanIdToOtelSpanId.set(span.id, otelSpanId);

    const parentOtelId = span.parentId
      ? spanIdToOtelSpanId.get(span.parentId) ?? rootSpanId
      : rootSpanId;

    const attrs = compact<OtlpAttribute>([
      strAttr("steplens.span.id", span.id),
      strAttr("steplens.span.kind", span.kind),
    ]);

    // Copy user-defined attributes
    if (span.attributes) {
      for (const [k, v] of Object.entries(span.attributes)) {
        if (typeof v === "string") { const a = strAttr(k, v); if (a) attrs.push(a); }
        else if (typeof v === "number") { const a = Number.isInteger(v) ? intAttr(k, v) : doubleAttr(k, v); if (a) attrs.push(a); }
        else if (typeof v === "boolean") attrs.push(boolAttr(k, v));
      }
    }

    allOtelSpans.push({
      traceId,
      spanId: otelSpanId,
      parentSpanId: parentOtelId,
      name: span.name,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: msToNano(span.startedAt),
      endTimeUnixNano: msToNano(span.endedAt ?? span.startedAt),
      attributes: attrs,
      status: mapSpanStatus(span.status),
    });
  }

  // ── Model calls ─────────────────────────────────────────────────────────────
  for (const mc of modelCalls) {
    // If the model call has a spanId, we enrich that span instead of creating a new one
    if (mc.spanId && spanIdToOtelSpanId.has(mc.spanId)) {
      const mcSpanId = mc.spanId;
      const existing = allOtelSpans.find((s) => s.spanId === spanIdToOtelSpanId.get(mcSpanId));
      if (existing) {
        existing.attributes.push(
          ...compact<OtlpAttribute>([
            strAttr("gen_ai.system", mc.provider),
            strAttr("gen_ai.request.model", mc.model),
            intAttr("gen_ai.usage.input_tokens", mc.inputTokens),
            intAttr("gen_ai.usage.output_tokens", mc.outputTokens),
            intAttr("gen_ai.usage.total_tokens", mc.totalTokens),
            doubleAttr("gen_ai.cost.usd", mc.estimatedCostUsd),
          ]),
        );
        if (includeContent && mc.prompt) {
          const a = strAttr("gen_ai.prompt", mc.prompt);
          if (a) existing.attributes.push(a);
        }
        if (includeContent && mc.response) {
          const a = strAttr("gen_ai.completion", mc.response);
          if (a) existing.attributes.push(a);
        }
        if (includeContent && mc.messages?.length) {
          const a = strAttr("gen_ai.messages", safeStringify(mc.messages));
          if (a) existing.attributes.push(a);
        }
        continue;
      }
    }

    // Create a synthetic span for this model call
    const mcSpanId = deriveSpanId(mc.id);
    const parentOtelId = mc.spanId
      ? spanIdToOtelSpanId.get(mc.spanId) ?? rootSpanId
      : rootSpanId;

    const mcAttrs = compact<OtlpAttribute>([
      strAttr("steplens.model_call.id", mc.id),
      strAttr("gen_ai.system", mc.provider),
      strAttr("gen_ai.request.model", mc.model),
      intAttr("gen_ai.usage.input_tokens", mc.inputTokens),
      intAttr("gen_ai.usage.output_tokens", mc.outputTokens),
      intAttr("gen_ai.usage.total_tokens", mc.totalTokens),
      doubleAttr("gen_ai.cost.usd", mc.estimatedCostUsd),
    ]);

    if (includeContent && mc.prompt) {
      const a = strAttr("gen_ai.prompt", mc.prompt);
      if (a) mcAttrs.push(a);
    }
    if (includeContent && mc.response) {
      const a = strAttr("gen_ai.completion", mc.response);
      if (a) mcAttrs.push(a);
    }
    if (includeContent && mc.messages?.length) {
      const a = strAttr("gen_ai.messages", safeStringify(mc.messages));
      if (a) mcAttrs.push(a);
    }

    allOtelSpans.push({
      traceId,
      spanId: mcSpanId,
      parentSpanId: parentOtelId,
      name: `model:${mc.provider}/${mc.model}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: msToNano(mc.startedAt),
      endTimeUnixNano: msToNano(mc.endedAt ?? mc.startedAt),
      attributes: mcAttrs,
      status: { code: STATUS_UNSET },
    });
  }

  // ── Tool calls ──────────────────────────────────────────────────────────────
  for (const tc of toolCalls) {
    if (tc.spanId && spanIdToOtelSpanId.has(tc.spanId)) {
      const tcSpanId = tc.spanId;
      const existing = allOtelSpans.find((s) => s.spanId === spanIdToOtelSpanId.get(tcSpanId));
      if (existing) {
        existing.attributes.push(
          ...compact<OtlpAttribute>([
            strAttr("steplens.tool.name", tc.toolName),
            strAttr("steplens.tool.status", tc.status),
          ]),
        );
        if (includeContent && tc.input != null) {
          const a = strAttr("steplens.tool.input", safeStringify(tc.input));
          if (a) existing.attributes.push(a);
        }
        if (includeContent && tc.output != null) {
          const a = strAttr("steplens.tool.output", safeStringify(tc.output));
          if (a) existing.attributes.push(a);
        }
        if (tc.error) {
          const err = tc.error as { name?: string; message?: string; stack?: string };
          existing.attributes.push(
            ...compact<OtlpAttribute>([
              strAttr("exception.type", err.name ?? "Error"),
              strAttr("exception.message", err.message ?? ""),
            ]),
          );
          existing.status = { code: STATUS_ERROR };
        }
        continue;
      }
    }

    const tcSpanId = deriveSpanId(tc.id);
    const parentOtelId = tc.spanId
      ? spanIdToOtelSpanId.get(tc.spanId) ?? rootSpanId
      : rootSpanId;

    const tcAttrs = compact<OtlpAttribute>([
      strAttr("steplens.tool_call.id", tc.id),
      strAttr("steplens.tool.name", tc.toolName),
      strAttr("steplens.tool.status", tc.status),
    ]);

    if (includeContent && tc.input != null) {
      const a = strAttr("steplens.tool.input", safeStringify(tc.input));
      if (a) tcAttrs.push(a);
    }
    if (includeContent && tc.output != null) {
      const a = strAttr("steplens.tool.output", safeStringify(tc.output));
      if (a) tcAttrs.push(a);
    }
    if (tc.error) {
      const err = tc.error as { name?: string; message?: string; stack?: string };
      tcAttrs.push(
        ...compact<OtlpAttribute>([
          strAttr("exception.type", err.name ?? "Error"),
          strAttr("exception.message", err.message ?? ""),
          err.stack ? strAttr("exception.stacktrace", err.stack) : null,
        ]),
      );
    }

    allOtelSpans.push({
      traceId,
      spanId: tcSpanId,
      parentSpanId: parentOtelId,
      name: `tool:${tc.toolName}`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: msToNano(tc.startedAt),
      endTimeUnixNano: msToNano(tc.endedAt ?? tc.startedAt),
      attributes: tcAttrs,
      status: mapToolCallStatus(tc.status),
    });
  }

  // ── Assemble OTLP payload ──────────────────────────────────────────────────
  return {
    resourceSpans: [
      {
        resource: {
          attributes: compact<OtlpAttribute>([
            strAttr("service.name", serviceName),
            strAttr("telemetry.sdk.name", "steplens"),
            strAttr("telemetry.sdk.version", OTEL_SCOPE_VERSION),
          ]),
        },
        scopeSpans: [
          {
            scope: { name: OTEL_SCOPE_NAME, version: OTEL_SCOPE_VERSION },
            spans: allOtelSpans,
          },
        ],
      },
    ],
  };
}

// ── Send to OTLP endpoint ───────────────────────────────────────────────────

export interface SendOtlpOptions extends OtelBridgeOptions {
  /** OTLP/HTTP endpoint (must accept JSON). */
  otlpEndpoint?: string;
}

/**
 * Resolve the OTLP endpoint from explicit option, env vars, or fallback.
 */
export function resolveOtlpEndpoint(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  }
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/+$/, "");
    return `${base}/v1/traces`;
  }
  return "http://localhost:4318/v1/traces";
}

/**
 * Convert and send a StepLens trace to an OTLP/HTTP JSON endpoint.
 * Returns the HTTP response for inspection.
 */
export async function sendOtlpTrace(
  traceExport: TraceExport,
  options?: SendOtlpOptions,
): Promise<Response> {
  const endpoint = resolveOtlpEndpoint(options?.otlpEndpoint);
  const payload = toOtlpTrace(traceExport, options);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  return res;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
