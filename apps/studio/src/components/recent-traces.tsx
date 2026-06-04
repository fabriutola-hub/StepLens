"use client";

import Link from "next/link";
import { Clock, X } from "lucide-react";
import { useRecentTraces, clearRecent } from "@/stores/recent-traces";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";

/**
 * Renders the most recent traces the user has opened. Lives in the workbench
 * footer / side rail. Empty state is a no-op.
 */
export function RecentTraces({ className }: { className?: string }) {
  const entries = useRecentTraces();
  if (entries.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="size-3" />
          Recently viewed
        </h3>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={clearRecent}
          aria-label="Clear recent traces"
          title="Clear"
        >
          <X className="size-3" />
        </Button>
      </div>
      <ul className="space-y-0.5">
        {entries.map((e) => (
          <li key={e.id}>
            <Link
              href={`/traces/${e.id}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <span className="truncate font-medium">{e.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(e.viewedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
