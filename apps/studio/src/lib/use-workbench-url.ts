"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  parseUrlState,
  stringifyUrlState,
  type WorkbenchUrlState,
} from "./url-filters";
import type { TraceFilters, TraceSortField, SortOrder } from "./trace-types";

/**
 * Two-way sync between the Workbench's filter state and the URL.
 *
 * Direction 1 (state → URL): whenever the caller provides a new
 * `state`, we replace the URL's query string. Uses `router.replace` (not
 * `push`) so the browser back button skips intermediate filter edits.
 *
 * Direction 2 (URL → state): on mount, we read the URL once and forward
 * it to the caller via `onInitial`. After that, internal state changes
 * own the URL. Browser back / forward is intentionally NOT observed —
 * the Workbench owns the URL and we don't want URL changes to fight
 * in-flight fetches.
 */
export function useWorkbenchUrl(opts: {
  filters: TraceFilters;
  sort: TraceSortField;
  order: SortOrder;
  page: number;
  onInitial: (state: WorkbenchUrlState) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasFiredInitial = useRef(false);

  // Initial state from the URL — only fire once per mount.
  useEffect(() => {
    if (hasFiredInitial.current) return;
    hasFiredInitial.current = true;
    const parsed = parseUrlState(searchParamsToObject(searchParams));
    opts.onInitial(parsed);
    // We only want the URL at mount; later renders use internal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State → URL. Skip on the very first render to avoid a redundant
  // navigation right after reading the URL.
  useEffect(() => {
    if (!hasFiredInitial.current) return;
    const next = stringifyUrlState({
      filters: opts.filters,
      sort: opts.sort,
      order: opts.order,
      page: opts.page,
    });
    const current = stringifyUrlState({
      filters: parseUrlState(searchParamsToObject(searchParams)).filters,
      sort: parseUrlState(searchParamsToObject(searchParams)).sort,
      order: parseUrlState(searchParamsToObject(searchParams)).order,
      page: parseUrlState(searchParamsToObject(searchParams)).page,
    });
    if (next === current) return;
    const url = next ? `${pathname}?${next}` : pathname;
    router.replace(url, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.filters, opts.sort, opts.order, opts.page]);
}

function searchParamsToObject(
  sp: URLSearchParams
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp) out[k] = v;
  return out;
}
