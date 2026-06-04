"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useTraceStore } from "@/stores/trace-store";
import { EmptyState } from "@/components/empty-state";
import { formatCostUsd } from "@/lib/timeline";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  success: "secondary",
  error: "destructive",
  cancelled: "outline",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TraceListSkeleton() {
  return (
    <div className="space-y-2 px-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TraceList() {
  const router = useRouter();
  const traces = useTraceStore((s) => s.traces);
  const loading = useTraceStore((s) => s.loading);
  const total = useTraceStore((s) => s.total);
  const page = useTraceStore((s) => s.page);
  const pageSize = useTraceStore((s) => s.pageSize);
  const setPage = useTraceStore((s) => s.setPage);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!loading && traces.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <TraceListSkeleton />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead title="Estimated cost in USD">Est. Cost</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map((trace) => (
              <TableRow
                key={trace.id}
                className="cursor-pointer"
                onClick={() => router.push(`/traces/${trace.id}`)}
              >
                <TableCell className="max-w-48 truncate font-medium">
                  {trace.name}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[trace.status] ?? "outline"}>
                    {trace.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDuration(trace.durationMs)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatCostUsd(trace.estimatedCostUsd)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(trace.startedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
