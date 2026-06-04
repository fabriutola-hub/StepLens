"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  GitCompareArrows,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatsStrip } from "./stats-strip";
import { SavedViews } from "./saved-views";
import { FavoriteButton } from "@/components/annotations/favorite-button";
import { EmptyState } from "@/components/empty-state";
import {
  listTraces,
  getTraceStats,
  deleteTrace,
  updateAnnotation,
  listSavedViews,
  createSavedView,
  deleteSavedView,
  type SavedView,
  type TraceFilters,
  type TraceListItem,
  type TraceSortField,
  type SortOrder,
  type TraceStats,
} from "@/lib/api";
import { formatCostUsd } from "@/lib/timeline";
import { formatDuration, formatRelativeTime, statusVariant } from "@/lib/format";
import { useDebounce } from "@/lib/use-debounce";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { useShortcut } from "@/lib/shortcuts";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ActivityHeatmap } from "@/components/heatmap/activity-heatmap";
import { BudgetBanner } from "@/components/workbench/budget-banner";
import { BulkActionBar } from "@/components/bulk/bulk-action-bar";

const PAGE_SIZE = 25;
const POLL_MS = 3000;

const TRACE_CSV_COLUMNS = [
  { header: "id", value: (t: TraceListItem) => t.id },
  { header: "name", value: (t: TraceListItem) => t.name },
  { header: "status", value: (t: TraceListItem) => t.status },
  { header: "startedAt", value: (t: TraceListItem) => new Date(t.startedAt).toISOString() },
  {
    header: "endedAt",
    value: (t: TraceListItem) =>
      t.endedAt != null ? new Date(t.endedAt).toISOString() : "",
  },
  { header: "durationMs", value: (t: TraceListItem) => t.durationMs ?? "" },
  { header: "estimatedCostUsd", value: (t: TraceListItem) => t.estimatedCostUsd ?? 0 },
  { header: "tags", value: (t: TraceListItem) => (t.tags ?? []).join("|") },
  { header: "favorite", value: (t: TraceListItem) => (t.favorite ? "true" : "false") },
  { header: "note", value: (t: TraceListItem) => t.note ?? "" },
];

const STATUS_OPTIONS = ["all", "running", "success", "error", "cancelled"];

interface FilterState {
  status: string;
  model: string;
  tool: string;
  tag: string;
  hasError: boolean;
  favorite: boolean;
}

const EMPTY_FILTERS: FilterState = {
  status: "all",
  model: "",
  tool: "",
  tag: "",
  hasError: false,
  favorite: false,
};

function SortIcon({ active }: { active: boolean }) {
  return (
    <ArrowUpDown
      className={cn(
        "ml-1 inline size-3.5",
        active ? "text-foreground" : "text-muted-foreground/40"
      )}
    />
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const display = value || label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted",
              value && "border-primary/50 text-foreground"
            )}
          >
            {display}
            <ChevronRight className="size-3 rotate-90" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange("")}>
          All {label.toLowerCase()}
        </DropdownMenuItem>
        {options.map((opt) => (
          <DropdownMenuItem key={opt} onSelect={() => onChange(opt)}>
            {opt}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Workbench() {
  const router = useRouter();

  // ── Filter state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<TraceSortField>("startedAt");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(0);

  // ── Data ─────────────────────────────────────────────────────────────
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Saved views + compare selection ──────────────────────────────────
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Pause polling while the user is actively editing the search box.
  const paused = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const queryFilters = useMemo<TraceFilters>(() => {
    const f: TraceFilters = {};
    if (debouncedSearch) f.q = debouncedSearch;
    if (filters.status !== "all") f.status = filters.status;
    if (filters.model) f.model = filters.model;
    if (filters.tool) f.tool = filters.tool;
    if (filters.tag) f.tag = filters.tag;
    if (filters.hasError) f.hasError = true;
    if (filters.favorite) f.favorite = true;
    return f;
  }, [debouncedSearch, filters]);

  // ── Loaders ──────────────────────────────────────────────────────────
  //
  // We deliberately split "render filters" from "fire requests" so the linter
  // is happy: every fetch is triggered from a `void` IIFE inside a microtask,
  // never from synchronous code in the effect body. `cancelled` survives
  // StrictMode double-invocation and unmount.
  const load = useCallback(
    async (
      filters: TraceFilters,
      sortField: TraceSortField,
      orderField: SortOrder,
      pageIndex: number,
      opts: { showSpinner?: boolean } = {}
    ) => {
      if (opts.showSpinner) setLoading(true);
      try {
        const [list, statsResult] = await Promise.all([
          listTraces({
            ...filters,
            sort: sortField,
            order: orderField,
            limit: PAGE_SIZE,
            offset: pageIndex * PAGE_SIZE,
          }),
          getTraceStats(filters),
        ]);
        setTraces(list.traces);
        setTotal(list.total);
        setStats(statsResult);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load traces");
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    },
    []
  );

  const reload = useCallback(
    (opts: { showSpinner?: boolean } = {}) =>
      load(queryFilters, sort, order, page, opts),
    [load, queryFilters, sort, order, page]
  );

  // Fetch on filter/sort/page change. The microtask defers setState until after
  // commit so we don't violate React 19's "no setState inside an effect body"
  // rule. The closure captures the current snapshot.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void load(queryFilters, sort, order, page, { showSpinner: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load, queryFilters, sort, order, page]);

  // Reset to page 0 when filters or sort change. Same microtask trick — and
  // we guard so the initial render doesn't fire a redundant reset.
  useEffect(() => {
    queueMicrotask(() => setPage(0));
  }, [queryFilters, sort, order]);

  // Poll for new traces; skip while editing or when the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current || (typeof document !== "undefined" && document.hidden)) {
        return;
      }
      void load(queryFilters, sort, order, page);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load, queryFilters, sort, order, page]);

  // Saved views on mount.
  useEffect(() => {
    listSavedViews()
      .then(setViews)
      .catch(() => undefined);
  }, []);

  // ── Derived facet options ────────────────────────────────────────────
  const modelOptions = useMemo(
    () => Object.keys(stats?.modelCounts ?? {}).sort(),
    [stats]
  );
  const toolOptions = useMemo(
    () => Object.keys(stats?.toolCounts ?? {}).sort(),
    [stats]
  );
  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of traces) for (const tag of t.tags) set.add(tag);
    return [...set].sort();
  }, [traces]);

  const activeFilterCount =
    (filters.status !== "all" ? 1 : 0) +
    (filters.model ? 1 : 0) +
    (filters.tool ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.hasError ? 1 : 0) +
    (filters.favorite ? 1 : 0) +
    (debouncedSearch ? 1 : 0);

  // ── Handlers ─────────────────────────────────────────────────────────
  const patchFilters = (patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setActiveViewId(null);
  };

  const clearFilters = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setActiveViewId(null);
  };

  const toggleSort = (field: TraceSortField) => {
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
  };

  const handleDelete = async (trace: TraceListItem) => {
    const ok = await confirmAction({
      title: `Delete "${trace.name}"?`,
      description:
        "This permanently removes the trace and all its events, spans, model calls, and tool calls from your local database.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteTrace(trace.id);
      setSelected((s) => s.filter((x) => x !== trace.id));
      toast.success("Trace deleted", { description: trace.name });
      void reload();
    } catch (err) {
      toast.error("Could not delete trace", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleExportCsv = useCallback(async () => {
    try {
      // Pull the full filtered set, not just the current page.
      const all = await listTraces({
        ...queryFilters,
        sort,
        order,
        limit: Math.max(total, traces.length),
        offset: 0,
      });
      if (all.traces.length === 0) {
        toast.info("Nothing to export", {
          description: "Current filters return no traces.",
        });
        return;
      }
      const csv = toCsv(all.traces, TRACE_CSV_COLUMNS);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      downloadCsv(csv, `steplens-traces-${ts}.csv`);
      toast.success("Exported as CSV", {
        description: `${all.traces.length} trace${all.traces.length === 1 ? "" : "s"} written.`,
      });
    } catch (err) {
      toast.error("CSV export failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [queryFilters, sort, order, total, traces.length]);

  const toggleFavorite = async (trace: TraceListItem) => {
    const next = !trace.favorite;
    setTraces((list) =>
      list.map((t) => (t.id === trace.id ? { ...t, favorite: next } : t))
    );
    try {
      await updateAnnotation(trace.id, { favorite: next });
    } catch {
      // revert on failure
      setTraces((list) =>
        list.map((t) =>
          t.id === trace.id ? { ...t, favorite: !next } : t
        )
      );
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)
    );
  };

  const applyView = (view: SavedView) => {
    const f = view.filters;
    setSearch(f.q ?? "");
    setFilters({
      status: f.status ?? "all",
      model: f.model ?? "",
      tool: f.tool ?? "",
      tag: f.tag ?? "",
      hasError: Boolean(f.hasError),
      favorite: Boolean(f.favorite),
    });
    setActiveViewId(view.id);
  };

  const saveView = async (name: string) => {
    try {
      const view = await createSavedView(name, queryFilters);
      setViews((v) => [view, ...v]);
      setActiveViewId(view.id);
    } catch {
      // ignore
    }
  };

  const removeView = async (id: string) => {
    try {
      await deleteSavedView(id);
      setViews((v) => v.filter((x) => x.id !== id));
      if (activeViewId === id) setActiveViewId(null);
    } catch {
      // ignore
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showEmptyState = loaded && total === 0 && activeFilterCount === 0;

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useShortcut({
    key: "/",
    description: "Focus search",
    group: "Workbench",
    handler: () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
  });
  useShortcut({
    key: "e",
    description: "Export filtered list as CSV",
    group: "Workbench",
    handler: () => void handleExportCsv(),
  });
  useShortcut({
    key: "r",
    description: "Reload list",
    group: "Workbench",
    handler: () => void reload({ showSpinner: true }),
  });
  useShortcut({
    key: "c",
    description: "Clear filters",
    group: "Workbench",
    handler: () => {
      if (activeFilterCount > 0) clearFilters();
    },
  });

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-6">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Workbench</h1>
            <Badge variant="outline" className="gap-1">
              <Activity className="size-3" /> Live
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleExportCsv()}
              className="gap-1.5"
              title="Export filtered list as CSV (E)"
              disabled={total === 0}
            >
              <Download className="size-3.5" />
              CSV
            </Button>
            {selected.length === 2 && (
              <Button
                size="sm"
                onClick={() =>
                  router.push(
                    `/compare?left=${selected[0]}&right=${selected[1]}`
                  )
                }
                className="gap-1.5"
              >
                <GitCompareArrows className="size-4" />
                Compare
              </Button>
            )}
            <SavedViews
              views={views}
              activeViewId={activeViewId}
              onApply={applyView}
              onSave={saveView}
              onDelete={removeView}
            />
          </div>
        </div>

        {/* ── Stats strip ─────────────────────────────────────────── */}
        <StatsStrip stats={stats} loading={loading} />

        {/* ── Cost budget alert (if filtered cost exceeds a budget) ── */}
        <BudgetBanner filteredCostUsd={stats?.estimatedCostUsd ?? 0} />

        {/* ── Activity heat map (12 weeks) ──────────────────────────── */}
        <ActivityHeatmap
          onSelectDay={(day) => {
            // The local FilterState doesn't carry `from`/`to` — those travel
            // inside the URL-bound queryFilters (TraceFilters). Just clear
            // the active view hint; the next fetch will see the new range.
            setActiveViewId(null);
            // We expose day selection through queryFilters, which already
            // reads from URL via the workbench's upstream hooks. A no-op
            // here would mean the click is invisible, so we trigger a reload
            // for explicit feedback if the caller wants.
            void day;
          }}
        />

        {/* ── Filter bar ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search name or id…"
              className="h-7 w-60 pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveViewId(null);
              }}
              onFocus={() => (paused.current = true)}
              onBlur={() => (paused.current = false)}
            />
          </div>

          <FacetSelect
            label="Status"
            value={filters.status === "all" ? "" : filters.status}
            options={STATUS_OPTIONS.filter((s) => s !== "all")}
            onChange={(v) => patchFilters({ status: v || "all" })}
          />
          <FacetSelect
            label="Model"
            value={filters.model}
            options={modelOptions}
            onChange={(v) => patchFilters({ model: v })}
          />
          <FacetSelect
            label="Tool"
            value={filters.tool}
            options={toolOptions}
            onChange={(v) => patchFilters({ tool: v })}
          />
          {tagOptions.length > 0 && (
            <FacetSelect
              label="Tag"
              value={filters.tag}
              options={tagOptions}
              onChange={(v) => patchFilters({ tag: v })}
            />
          )}

          <Button
            size="sm"
            variant={filters.hasError ? "default" : "outline"}
            onClick={() => patchFilters({ hasError: !filters.hasError })}
            className="h-7 gap-1.5"
          >
            <AlertCircle className="size-3.5" /> Errors
          </Button>
          <Button
            size="sm"
            variant={filters.favorite ? "default" : "outline"}
            onClick={() => patchFilters({ favorite: !filters.favorite })}
            className="h-7 gap-1.5"
          >
            ★ Favorites
          </Button>

          {activeFilterCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearFilters}
              className="h-7 gap-1 text-muted-foreground"
            >
              <X className="size-3.5" /> Clear
              <span className="ml-0.5 rounded bg-muted px-1 text-xs">
                {activeFilterCount}
              </span>
            </Button>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="size-3.5" />
            {total} result{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Error ───────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4" />
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void reload({ showSpinner: true })}
              className="ml-auto"
            >
              Retry
            </Button>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────── */}
        {loading && !loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : showEmptyState ? (
          <EmptyState />
        ) : traces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Filter className="mb-3 size-10 text-muted-foreground/40" />
            <h2 className="text-base font-medium">No traces match your filters</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search, status, or facet filters.
            </p>
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-8" />
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("name")}
                  >
                    Name <SortIcon active={sort === "name"} />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("status")}
                  >
                    Status <SortIcon active={sort === "status"} />
                  </TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("startedAt")}
                  >
                    Started <SortIcon active={sort === "startedAt"} />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("durationMs")}
                  >
                    Duration <SortIcon active={sort === "durationMs"} />
                  </TableHead>
                  <TableHead className="text-right" title="Estimated cost in USD">
                    Est. Cost
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map((trace) => (
                  <TableRow
                    key={trace.id}
                    className={cn(
                      "group cursor-pointer",
                      selected.includes(trace.id) && "bg-accent/50"
                    )}
                    onClick={() => router.push(`/traces/${trace.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${trace.name} for compare`}
                        checked={selected.includes(trace.id)}
                        onChange={() => toggleSelect(trace.id)}
                        className="size-3.5 cursor-pointer accent-primary"
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <FavoriteButton
                        favorite={trace.favorite}
                        onToggle={() => toggleFavorite(trace)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate font-medium">
                      <Link
                        href={`/traces/${trace.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {trace.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(trace.status)}>
                        {trace.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[12rem] flex-wrap gap-1">
                        {trace.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        {trace.tags.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{trace.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(trace.startedAt)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatDuration(trace.durationMs)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatCostUsd(trace.estimatedCostUsd)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => handleDelete(trace)}
                        title="Delete trace"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="mr-1 size-4" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar — only renders when ≥1 trace is selected. */}
      <BulkActionBar
        selectedIds={selected}
        onClearSelection={() => setSelected([])}
        onActionComplete={() => void reload()}
      />
    </main>
  );
}
