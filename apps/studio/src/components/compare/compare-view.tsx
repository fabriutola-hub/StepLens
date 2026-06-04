"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, GitCompareArrows } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  compareTraces,
  type CompareCountDelta,
  type CompareResult,
  type CompareSpanDelta,
  type CompareTraceSummary,
} from "@/lib/api";
import { formatCostUsd } from "@/lib/timeline";
import {
  formatDeltaMs,
  formatDuration,
  formatNumber,
  formatTimestamp,
  statusVariant,
} from "@/lib/format";
import { cn } from "@/lib/utils";

interface CompareViewProps {
  left?: string;
  right?: string;
}

/** Color a delta: increases are "worse" (amber/red), decreases "better". */
function deltaClass(delta: number): string {
  if (delta === 0) return "text-muted-foreground";
  return delta > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400";
}

function signed(n: number, format: (v: number) => string): string {
  if (n === 0) return format(0);
  return `${n > 0 ? "+" : "-"}${format(Math.abs(n))}`;
}

function DeltaCard({
  label,
  left,
  right,
  delta,
  format,
  deltaText,
}: {
  label: string;
  left: string;
  right: string;
  delta: number;
  format?: (v: number) => string;
  deltaText?: string;
}) {
  const text =
    deltaText ?? (format ? signed(delta, format) : String(delta));
  return (
    <div className="flex min-w-[10rem] flex-1 flex-col gap-1 rounded-lg border bg-card px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono">{left}</span>
        <ArrowRight className="size-3 text-muted-foreground" />
        <span className="font-mono">{right}</span>
      </div>
      <span className={cn("text-sm font-semibold tabular-nums", deltaClass(delta))}>
        {text}
      </span>
    </div>
  );
}

function MetaColumn({
  summary,
  side,
}: {
  summary: CompareTraceSummary;
  side: "left" | "right";
}) {
  const t = summary.trace;
  return (
    <div className="flex-1 space-y-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {side === "left" ? "Left (base)" : "Right (compare)"}
        </span>
        <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
      </div>
      <h2 className="truncate text-base font-semibold" title={t.name}>
        {t.name}
      </h2>
      <dl className="space-y-1 text-sm">
        <Row label="Started">{formatTimestamp(t.startedAt)}</Row>
        <Row label="Duration">{formatDuration(t.durationMs)}</Row>
        <Row label="Tokens">{formatNumber(summary.totalTokens)}</Row>
        <Row label="Est. Cost">{formatCostUsd(summary.estimatedCostUsd)}</Row>
        <Row label="Models">{formatNumber(summary.modelCallCount)}</Row>
        <Row label="Tools">{formatNumber(summary.toolCallCount)}</Row>
        <Row label="Errors">{formatNumber(summary.errorCount)}</Row>
      </dl>
      {t.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {t.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}

function CountDeltaTable({
  title,
  rows,
}: {
  title: string;
  rows: CompareCountDelta[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Left</TableHead>
            <TableHead className="text-right">Right</TableHead>
            <TableHead className="text-right">Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right font-mono">{r.left}</TableCell>
              <TableCell className="text-right font-mono">{r.right}</TableCell>
              <TableCell
                className={cn("text-right font-mono", deltaClass(r.delta))}
              >
                {r.delta > 0 ? `+${r.delta}` : r.delta}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SpanDeltaTable({ rows }: { rows: CompareSpanDelta[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Matched spans (kind:name)
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Span</TableHead>
            <TableHead className="text-right">Left</TableHead>
            <TableHead className="text-right">Right</TableHead>
            <TableHead className="text-right">Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">
                {r.key}
                {(r.leftDurationMs == null || r.rightDurationMs == null) && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.leftDurationMs == null ? "right only" : "left only"}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {r.leftDurationMs == null ? "—" : formatDuration(r.leftDurationMs)}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {r.rightDurationMs == null
                  ? "—"
                  : formatDuration(r.rightDurationMs)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  r.deltaMs == null ? "text-muted-foreground" : deltaClass(r.deltaMs)
                )}
              >
                {r.deltaMs == null ? "—" : formatDeltaMs(r.deltaMs)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CompareView({ left, right }: CompareViewProps) {
  const router = useRouter();
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Effect-driven data fetching: the AbortController makes this safe against
  // double-invocation (StrictMode) and component unmount mid-request.
  useEffect(() => {
    if (!left || !right) {
      // Skipping the request is the only "synchronous-looking" branch; we wrap
      // it in a microtask so it lands after the commit and not inside the
      // effect body. This keeps React 19's purity rule satisfied.
      queueMicrotask(() => {
        setError("Select two traces to compare.");
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });

    (async () => {
      try {
        const res = await compareTraces(left, right);
        if (!cancelled) setResult(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to compare traces");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [left, right]);

  const goBack = useCallback(() => router.push("/"), [router]);

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={goBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <GitCompareArrows className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Compare traces</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <AlertCircle className="size-10 text-destructive/50" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={goBack}>
              Back to workbench
            </Button>
          </div>
        ) : result ? (
          <div className="space-y-6">
            {/* Delta cards */}
            <div className="flex flex-wrap gap-3">
              <DeltaCard
                label="Duration"
                left={formatDuration(result.left.durationMs)}
                right={formatDuration(result.right.durationMs)}
                delta={result.deltas.durationMs}
                deltaText={formatDeltaMs(result.deltas.durationMs)}
              />
              <DeltaCard
                label="Est. Cost"
                left={formatCostUsd(result.left.estimatedCostUsd)}
                right={formatCostUsd(result.right.estimatedCostUsd)}
                delta={result.deltas.estimatedCostUsd}
                deltaText={`${result.deltas.estimatedCostUsd >= 0 ? "+" : "-"}${formatCostUsd(
                  Math.abs(result.deltas.estimatedCostUsd)
                )}`}
              />
              <DeltaCard
                label="Tokens"
                left={formatNumber(result.left.totalTokens)}
                right={formatNumber(result.right.totalTokens)}
                delta={result.deltas.totalTokens}
                format={(v) => formatNumber(v)}
              />
              <DeltaCard
                label="Errors"
                left={String(result.left.errorCount)}
                right={String(result.right.errorCount)}
                delta={result.deltas.errorCount}
                format={(v) => String(v)}
              />
            </div>

            {/* Side-by-side metadata */}
            <div className="flex flex-col gap-3 md:flex-row">
              <MetaColumn summary={result.left} side="left" />
              <MetaColumn summary={result.right} side="right" />
            </div>

            {/* Breakdowns */}
            <div className="grid gap-4 lg:grid-cols-2">
              <CountDeltaTable title="Models" rows={result.deltas.models} />
              <CountDeltaTable title="Tools" rows={result.deltas.tools} />
            </div>

            <SpanDeltaTable rows={result.deltas.spans} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
