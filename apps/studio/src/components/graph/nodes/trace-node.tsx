"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import type { TraceNodeData } from "@/lib/graph-layout";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  error: "destructive",
  running: "secondary",
  cancelled: "outline",
};

function TraceNodeComponent({ data }: NodeProps) {
  const d = data as unknown as TraceNodeData;

  return (
    <div
      className="rounded-lg border-2 border-foreground/30 bg-card px-3 py-2 shadow-md"
      style={{ width: 220 }}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{d.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={STATUS_VARIANT[d.status] ?? "outline"} className="px-1 py-0 text-[10px]">
          {d.status}
        </Badge>
        <span>{d.durationLabel}</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !size-1.5" />
    </div>
  );
}

export const TraceNode = memo(TraceNodeComponent);
