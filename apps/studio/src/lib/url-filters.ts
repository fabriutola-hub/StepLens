/**
 * Sticky URL filters — bidirectional sync between Workbench filter state
 * and the URL query string. Bookmarkable, shareable, browser-back-friendly.
 *
 * Keep this pure: it doesn't import React or Next, so we can test it in a
 * plain vitest run without a DOM mock.
 */
import type {
  TraceFilters,
  TraceSortField,
  SortOrder,
} from "./trace-types";

export interface WorkbenchUrlState {
  filters: TraceFilters;
  sort?: TraceSortField;
  order?: SortOrder;
  page?: number;
}

const SORT_FIELDS: readonly TraceSortField[] = [
  "startedAt",
  "durationMs",
  "name",
  "status",
];
const ORDERS: readonly SortOrder[] = ["asc", "desc"];

const STATUSES = new Set(["running", "success", "error", "cancelled"]);

/** Parse `URLSearchParams` (or a plain object) into typed Workbench state. */
export function parseUrlState(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): WorkbenchUrlState {
  const get = (k: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const filters: TraceFilters = {};

  const q = get("q")?.trim();
  if (q) filters.q = q;

  const status = get("status")?.trim();
  if (status && STATUSES.has(status)) filters.status = status;

  const from = Number(get("from"));
  if (Number.isFinite(from) && from > 0) filters.from = from;

  const to = Number(get("to"));
  if (Number.isFinite(to) && to > 0) filters.to = to;

  const model = get("model")?.trim();
  if (model) filters.model = model;

  const tool = get("tool")?.trim();
  if (tool) filters.tool = tool;

  if (get("hasError") === "1" || get("hasError") === "true") {
    filters.hasError = true;
  }
  if (get("favorite") === "1" || get("favorite") === "true") {
    filters.favorite = true;
  }

  const tag = get("tag")?.trim();
  if (tag) filters.tag = tag;

  const result: WorkbenchUrlState = { filters };

  const sort = get("sort");
  if (sort && (SORT_FIELDS as readonly string[]).includes(sort)) {
    result.sort = sort as TraceSortField;
  }

  const order = get("order");
  if (order && (ORDERS as readonly string[]).includes(order)) {
    result.order = order as SortOrder;
  }

  const page = Number(get("page"));
  if (Number.isFinite(page) && page >= 0) {
    result.page = Math.floor(page);
  }

  return result;
}

/**
 * Serialize state into a stable query string. We omit defaults (empty
 * filters, `page=0`, `order=desc`, `sort=startedAt`) so the URL stays
 * clean — a fresh Workbench load has no `?…` at all.
 */
export function stringifyUrlState(state: WorkbenchUrlState): string {
  const params = new URLSearchParams();

  const f = state.filters;
  if (f.q) params.set("q", f.q);
  if (f.status) params.set("status", f.status);
  if (f.from) params.set("from", String(f.from));
  if (f.to) params.set("to", String(f.to));
  if (f.model) params.set("model", f.model);
  if (f.tool) params.set("tool", f.tool);
  if (f.hasError) params.set("hasError", "1");
  if (f.favorite) params.set("favorite", "1");
  if (f.tag) params.set("tag", f.tag);

  if (state.sort && state.sort !== "startedAt") params.set("sort", state.sort);
  if (state.order && state.order !== "desc") params.set("order", state.order);
  if (state.page && state.page > 0) params.set("page", String(state.page));

  // URLSearchParams.toString() encodes spaces as `+`, which is fine for
  // application/x-www-form-urlencoded but `%20` is more portable. Replace
  // for stability across env (curl, browser address bar, GitHub previews).
  return params.toString().replace(/\+/g, "%20");
}

/** True if two states represent the same selection (cheap deep-equal). */
export function urlStateEquals(a: WorkbenchUrlState, b: WorkbenchUrlState): boolean {
  return stringifyUrlState(a) === stringifyUrlState(b);
}
