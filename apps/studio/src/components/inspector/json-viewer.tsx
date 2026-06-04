"use client";

import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_STRING_LENGTH = 500;
const MAX_DISPLAY_LENGTH = 10_000;

// ── Public Component ────────────────────────────────────────────────────────

interface JsonViewerProps {
  data: unknown;
  label?: string;
  defaultOpen?: boolean;
  className?: string;
}

export function JsonViewer({
  data,
  label,
  defaultOpen = false,
  className,
}: JsonViewerProps) {
  if (data == null) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        {label && <span className="font-medium">{label}: </span>}
        <span className="italic">null</span>
      </div>
    );
  }

  if (typeof data !== "object") {
    return (
      <div className={cn("text-sm", className)}>
        {label && (
          <span className="font-medium text-muted-foreground">{label}: </span>
        )}
        <PrimitiveValue value={data} />
      </div>
    );
  }

  return (
    <div className={cn("text-sm", className)}>
      <CollapsibleNode
        label={label ?? "data"}
        data={data as Record<string, unknown> | unknown[]}
        defaultOpen={defaultOpen}
        depth={0}
      />
    </div>
  );
}

// ── Primitive Value ─────────────────────────────────────────────────────────

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null) return <span className="italic text-muted-foreground">null</span>;
  if (value === undefined) return <span className="italic text-muted-foreground">undefined</span>;
  if (typeof value === "string") {
    const truncated =
      value.length > MAX_STRING_LENGTH
        ? value.slice(0, MAX_STRING_LENGTH) + "…"
        : value;
    return (
      <span className="text-green-600 dark:text-green-400">
        &quot;{truncated}&quot;
      </span>
    );
  }
  if (typeof value === "number")
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  if (typeof value === "boolean")
    return <span className="text-orange-600 dark:text-orange-400">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

// ── Collapsible Node ────────────────────────────────────────────────────────

interface CollapsibleNodeProps {
  label: string;
  data: Record<string, unknown> | unknown[];
  defaultOpen: boolean;
  depth: number;
}

function CollapsibleNode({
  label,
  data,
  defaultOpen,
  depth,
}: CollapsibleNodeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);
  const count = entries.length;
  const bracket = isArray ? `[${count}]` : `{${count}}`;

  // Check if truncated
  const jsonStr = JSON.stringify(data);
  const isLarge = jsonStr && jsonStr.length > MAX_DISPLAY_LENGTH;

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="select-none">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground/60">{bracket}</span>
        {!open && isLarge && (
          <span className="ml-1 text-xs text-muted-foreground/40">
            ({formatBytes(jsonStr.length)})
          </span>
        )}
      </button>
      {open && (
        <div className="ml-4 border-l border-border/50 pl-2">
          {entries.map(([key, value]) => (
            <JsonEntry key={key} label={key} value={value} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Entry (recursive) ───────────────────────────────────────────────────────

function JsonEntry({
  label,
  value,
  depth,
}: {
  label: string;
  value: unknown;
  depth: number;
}) {
  if (value == null) {
    return (
      <div className="py-0.5">
        <span className="font-medium text-muted-foreground">{label}: </span>
        <span className="italic text-muted-foreground">null</span>
      </div>
    );
  }

  if (typeof value === "object") {
    // Lazy expansion — default closed after depth 1
    return (
      <CollapsibleNode
        label={label}
        data={value as Record<string, unknown> | unknown[]}
        defaultOpen={depth < 1}
        depth={depth}
      />
    );
  }

  return (
    <div className="py-0.5">
      <span className="font-medium text-muted-foreground">{label}: </span>
      <PrimitiveValue value={value} />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
