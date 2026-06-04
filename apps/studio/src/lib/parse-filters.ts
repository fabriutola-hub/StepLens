/**
 * Parse advanced trace filters + paging from a URL query string. Shared by the
 * /api/traces and /api/traces/stats route handlers so both interpret the same
 * parameters identically.
 */

import type { TraceListParams, TraceSortField } from "./trace-types";

const SORT_FIELDS: readonly TraceSortField[] = [
  "startedAt",
  "durationMs",
  "name",
  "status",
];

function num(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseTraceParams(searchParams: URLSearchParams): TraceListParams {
  const params: TraceListParams = {};

  const limit = num(searchParams.get("limit"));
  if (limit != null) params.limit = limit;
  const offset = num(searchParams.get("offset"));
  if (offset != null) params.offset = offset;

  const sort = searchParams.get("sort");
  if (sort && SORT_FIELDS.includes(sort as TraceSortField)) {
    params.sort = sort as TraceSortField;
  }
  const order = searchParams.get("order");
  if (order === "asc" || order === "desc") params.order = order;

  // `name` kept as a back-compatible alias for `q`.
  const q = searchParams.get("q") ?? searchParams.get("name");
  if (q) params.q = q;

  const status = searchParams.get("status");
  if (status && status !== "all") params.status = status;

  const from = num(searchParams.get("from"));
  if (from != null) params.from = from;
  const to = num(searchParams.get("to"));
  if (to != null) params.to = to;

  const model = searchParams.get("model");
  if (model) params.model = model;
  const tool = searchParams.get("tool");
  if (tool) params.tool = tool;

  if (searchParams.get("hasError") === "true") params.hasError = true;
  if (searchParams.get("favorite") === "true") params.favorite = true;

  const tag = searchParams.get("tag");
  if (tag) params.tag = tag;

  return params;
}
