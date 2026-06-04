/**
 * Graph layout — converts TraceDetail into React Flow nodes and edges,
 * then applies dagre auto-layout for DAG positioning.
 */

import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { TraceDetail } from "@/lib/api";
import { buildTimeline, type TimelineItem } from "@/lib/timeline";

// ── Constants ───────────────────────────────────────────────────────────────

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;
const COLLAPSE_THRESHOLD = 200;

// ── Node data types ─────────────────────────────────────────────────────────

export interface SpanNodeData {
  label: string;
  kind: string;
  status: string;
  durationLabel: string;
  timelineItem?: TimelineItem;
  [key: string]: unknown;
}

export interface ModelCallNodeData {
  label: string;
  model: string;
  provider: string;
  tokensLabel: string;
  costLabel: string;
  timelineItem?: TimelineItem;
  [key: string]: unknown;
}

export interface ToolCallNodeData {
  label: string;
  toolName: string;
  status: string;
  durationLabel: string;
  timelineItem?: TimelineItem;
  [key: string]: unknown;
}

export interface TraceNodeData {
  label: string;
  status: string;
  durationLabel: string;
  [key: string]: unknown;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type GraphNodeType = "traceNode" | "spanNode" | "modelCallNode" | "toolCallNode";

export interface GraphResult {
  nodes: Node[];
  edges: Edge[];
  collapsed: boolean;
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function buildGraph(detail: TraceDetail, isExpanded: boolean = false): GraphResult {
  const { trace, spans, modelCalls, toolCalls } = detail;
  const totalNodes = spans.length + modelCalls.length + toolCalls.length;
  const collapsed = !isExpanded && totalNodes > COLLAPSE_THRESHOLD;

  // Build dagre graph
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Pre-build timeline items to attach to node data for click handling
  const timelineItems = buildTimeline(detail);
  const itemMap = new Map<string, TimelineItem>(timelineItems.map((item) => [item.id, item]));

  // ── Trace root node ─────────────────────────────────────────────────
  const traceNodeId = `trace-${trace.id}`;
  g.setNode(traceNodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  nodes.push({
    id: traceNodeId,
    type: "traceNode",
    position: { x: 0, y: 0 },
    data: {
      label: trace.name,
      status: trace.status,
      durationLabel: formatDur(trace.durationMs),
    },
  });

  // ── Span nodes ──────────────────────────────────────────────────────
  // In collapsed mode, only show top-level spans (no parentId)
  const visibleSpans = collapsed
    ? spans.filter((s) => !s.parentId)
    : spans;

  for (const sp of visibleSpans) {
    const nodeId = `span-${sp.id}`;
    g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: nodeId,
      type: "spanNode",
      position: { x: 0, y: 0 },
      data: {
        label: sp.name,
        kind: sp.kind,
        status: sp.status,
        durationLabel: formatDur(sp.durationMs),
        timelineItem: itemMap.get(sp.id),
      },
    });

    // Edge: parent span → child span, or trace → top-level span
    if (sp.parentId && visibleSpans.some((s) => s.id === sp.parentId)) {
      const parentId = `span-${sp.parentId}`;
      g.setEdge(parentId, nodeId);
      edges.push({
        id: `e-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "straight",
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
      });
    } else {
      g.setEdge(traceNodeId, nodeId);
      edges.push({
        id: `e-${traceNodeId}-${nodeId}`,
        source: traceNodeId,
        target: nodeId,
        type: "straight",
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
      });
    }
  }

  // In collapsed mode, skip model calls and tool calls
  if (!collapsed) {
    // ── Model call nodes ────────────────────────────────────────────────
    for (const mc of modelCalls) {
      const nodeId = `mc-${mc.id}`;
      g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      nodes.push({
        id: nodeId,
        type: "modelCallNode",
        position: { x: 0, y: 0 },
        data: {
          label: `${mc.provider}/${mc.model}`,
          model: mc.model,
          provider: mc.provider,
          tokensLabel: `${mc.inputTokens ?? 0}→${mc.outputTokens ?? 0}`,
          costLabel: mc.estimatedCostUsd != null ? `$${mc.estimatedCostUsd.toFixed(4)}` : "—",
          timelineItem: itemMap.get(mc.id),
        },
      });

      // Connect to parent span or trace root
      const parentId = mc.spanId && visibleSpans.some((s) => s.id === mc.spanId)
        ? `span-${mc.spanId}`
        : traceNodeId;
      g.setEdge(parentId, nodeId);
      edges.push({
        id: `e-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "straight",
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
      });
    }

    // ── Tool call nodes ─────────────────────────────────────────────────
    for (const tc of toolCalls) {
      const nodeId = `tc-${tc.id}`;
      g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
      nodes.push({
        id: nodeId,
        type: "toolCallNode",
        position: { x: 0, y: 0 },
        data: {
          label: tc.toolName,
          toolName: tc.toolName,
          status: tc.status,
          durationLabel: formatDur(tc.durationMs),
          timelineItem: itemMap.get(tc.id),
        },
      });

      const parentId = tc.spanId && visibleSpans.some((s) => s.id === tc.spanId)
        ? `span-${tc.spanId}`
        : traceNodeId;
      g.setEdge(parentId, nodeId);
      edges.push({
        id: `e-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "straight",
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
      });
    }
  }

  // ── Apply dagre layout ──────────────────────────────────────────────
  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      };
    }
  }

  return { nodes, edges, collapsed };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = ((ms % 60_000) / 1000).toFixed(0);
  return `${min}m ${sec}s`;
}