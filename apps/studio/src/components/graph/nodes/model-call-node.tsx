"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ModelCallNodeData } from "@/lib/graph-layout";

function ModelCallNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ModelCallNodeData;

  return (
    <div
      className="rounded-lg border-2 border-purple-500/50 bg-card px-3 py-2 shadow-sm"
      style={{ width: 220 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !size-1.5" />
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-purple-500" />
        <span className="truncate text-sm font-medium">{d.label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Tokens: {d.tokensLabel}</span>
        <span className="ml-auto font-mono text-[10px]" title="Estimated cost (USD)">
          {d.costLabel === "—" ? "—" : `est. ${d.costLabel}`}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !size-1.5" />
    </div>
  );
}

export const ModelCallNode = memo(ModelCallNodeComponent);
