"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  Clock,
  AlertCircle,
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
import { listTraces, deleteTrace, type TraceRow } from "@/lib/api";

// ── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
type SortField = "startedAt" | "name" | "status" | "durationMs";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "cancelled", label: "Cancelled" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}

function statusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTraces({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        status: statusFilter !== "all" ? statusFilter : undefined,
        name: search || undefined,
      });
      setTraces(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch traces");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter]);

  // ── Sort toggle ──────────────────────────────────────────────────────
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // ── Sorted data (client-side re-sort after API returns) ──────────────
  const sorted = useMemo(() => {
    const arr = [...traces];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "durationMs":
          cmp = (a.durationMs ?? 0) - (b.durationMs ?? 0);
          break;
        default:
          cmp = a.startedAt - b.startedAt;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [traces, sortField, sortDir]);

  // ── Delete ───────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await deleteTrace(id);
      fetchTraces();
    } catch {
      // Silent fail for now
    }
  };

  // ── Pagination ───────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Sort icon ────────────────────────────────────────────────────────
  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`ml-1 inline size-3.5 ${
        sortField === field ? "text-foreground" : "text-muted-foreground/50"
      }`}
    />
  );

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Traces</h1>
            <p className="text-sm text-muted-foreground">
              {total} trace{total !== 1 ? "s" : ""} recorded
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search traces…"
                className="w-56 pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted">
                    {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ??
                      "All statuses"}
                    <ChevronRight className="size-3 rotate-90" />
                  </button>
                }
              />
              <DropdownMenuContent align="end">
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onSelect={() => setStatusFilter(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        {/* Error state */}
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4" />
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={fetchTraces} className="ml-auto">
              Retry
            </Button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Clock className="mb-4 size-12 text-muted-foreground/50" />
            <h2 className="text-lg font-medium">No traces found</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {search || statusFilter !== "all"
                ? "No traces match your current filters. Try adjusting your search or status filter."
                : "Start recording traces from your SDK to see them here."}
            </p>
          </div>
        ) : (
          <>
            {/* ── Table ──────────────────────────────────────────────── */}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("name")}
                    >
                      Name <SortIcon field="name" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("status")}
                    >
                      Status <SortIcon field="status" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("startedAt")}
                    >
                      Started <SortIcon field="startedAt" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-right"
                      onClick={() => toggleSort("durationMs")}
                    >
                      Duration <SortIcon field="durationMs" />
                    </TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      ID
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((trace) => (
                    <TableRow key={trace.id} className="group">
                      <TableCell className="font-medium">
                        <Link
                          href={`/traces/${trace.id}`}
                          className="hover:underline"
                        >
                          {trace.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor(trace.status)}>
                          {trace.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTimestamp(trace.startedAt)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatDuration(trace.durationMs)}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                        {trace.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => handleDelete(trace.id)}
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

            {/* ── Pagination ─────────────────────────────────────────── */}
            <div className="mt-4 flex items-center justify-between">
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
                  <ChevronLeft className="mr-1 size-4" />
                  Previous
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
                  Next
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
