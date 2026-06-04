"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import type { SpanNodeData } from "@/lib/graph-layout";

const KIND_COLORS: Record<string, string> = {
  agent: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  model: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
  tool: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  retrieval: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  parser: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
  custom: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
};

const STATUS_BORDER: Record<string, string> = {
  success: "border-emerald-500/50",
  error: "border-red-500/50",
  running: "border-blue-500/50",
};

function SpanNodeComponent({ data }: NodeProps) {
  const d = data as unknown as SpanNodeData;
  const borderClass = STATUS_BORDER[d.status] ?? "border-border";

  return (
    <div
      className={`rounded-lg border-2 bg-card px-3 py-2 shadow-sm ${borderClass}`}
      style={{ width: 220 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !size-1.5" />
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{d.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${
            KIND_COLORS[d.kind] ?? KIND_COLORS.custom
          }`}
        >
          {d.kind}
        </span>
        <span className="text-xs text-muted-foreground">{d.durationLabel}</span>
        {d.status === "error" && (
          <Badge variant="destructive" className="ml-auto px-1 py-0 text-[10px]">
            error
          </Badge>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !size-1.5" />
    </div>
  );
}

export const SpanNode = memo(SpanNodeComponent);
