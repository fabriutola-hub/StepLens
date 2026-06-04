"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AlertCircle, Expand, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TraceDetail } from "@/lib/api";
import { buildGraph } from "@/lib/graph-layout";
import { useSelection } from "@/stores/selection-store";
import { SpanNode } from "./nodes/span-node";
import { ModelCallNode } from "./nodes/model-call-node";
import { ToolCallNode } from "./nodes/tool-call-node";
import { TraceNode } from "./nodes/trace-node";

// ── Node types (module-level for React Flow perf) ───────────────────────────

const nodeTypes: NodeTypes = {
  spanNode: SpanNode,
  modelCallNode: ModelCallNode,
  toolCallNode: ToolCallNode,
  traceNode: TraceNode,
};

// ── Props ───────────────────────────────────────────────────────────────────

interface TraceGraphProps {
  detail: TraceDetail;
}

// ── Component ───────────────────────────────────────────────────────────────

export function TraceGraph({ detail }: TraceGraphProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const select = useSelection((s) => s.select);

  const graph = useMemo(() => buildGraph(detail, isExpanded), [detail, isExpanded]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);

  // Sync nodes and edges when graph layout changes (e.g., on expand/collapse)
  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph.nodes, graph.edges, setNodes, setEdges]);

  // Fit view on initial load
  const onInit = useCallback((instance: { fitView: (opts?: object) => void }) => {
    setTimeout(() => {
      instance.fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, []);

  // Handle node clicks to populate the inspector
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const d = node.data as any;
      if (d.timelineItem) {
        select(d.timelineItem);
      }
    },
    [select]
  );

  if (graph.nodes.length <= 1) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No spans, model calls, or tool calls recorded for this trace.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={1}
          zoomable
          pannable
          className="!bg-background/80 !border-border"
        />
      </ReactFlow>

      {/* Collapsed warning */}
      {graph.collapsed && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
          <Expand className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Showing top-level spans only (trace has 200+ items)
          </span>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(true)}>
            Expand all
          </Button>
        </div>
      )}

      {/* Expanded warning */}
      {isExpanded && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
          <Minimize className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Showing all items
          </span>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
            Collapse
          </Button>
        </div>
      )}
    </div>
  );
}