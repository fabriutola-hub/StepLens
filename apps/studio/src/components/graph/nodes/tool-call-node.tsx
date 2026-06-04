"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import type { ToolCallNodeData } from "@/lib/graph-layout";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  error: "destructive",
  running: "secondary",
};

function ToolCallNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ToolCallNodeData;

  return (
    <div
      className="rounded-lg border-2 border-emerald-500/50 bg-card px-3 py-2 shadow-sm"
      style={{ width: 220 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !size-1.5" />
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="truncate text-sm font-medium">{d.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{d.durationLabel}</span>
        <Badge
          variant={STATUS_VARIANT[d.status] ?? "outline"}
          className="ml-auto px-1 py-0 text-[10px]"
        >
          {d.status}
        </Badge>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !size-1.5" />
    </div>
  );
}

export const ToolCallNode = memo(ToolCallNodeComponent);
