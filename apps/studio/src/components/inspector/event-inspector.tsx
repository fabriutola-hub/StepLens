"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSelection } from "@/stores/selection-store";
import { JsonViewer } from "./json-viewer";
import type {
  EventRow,
  SpanRow,
  ModelCallRow,
  ToolCallRow,
} from "@/lib/api";
import type { TimelineItem, TimelineCategory } from "@/lib/timeline";

// ── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  event: "Event",
  span: "Span",
  model_call: "Model Call",
  tool_call: "Tool Call",
};

const CATEGORY_BADGE_VARIANT: Record<
  TimelineCategory,
  "default" | "secondary" | "destructive" | "outline"
> = {
  event: "outline",
  span: "secondary",
  model_call: "default",
  tool_call: "default",
};

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function formatDur(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function EventInspector() {
  const { selectedItem, clear } = useSelection();

  if (!selectedItem) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Click an event on the timeline to inspect it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={CATEGORY_BADGE_VARIANT[selectedItem.category]}>
            {CATEGORY_LABELS[selectedItem.category]}
          </Badge>
          <span className="truncate text-sm font-medium">{selectedItem.name}</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={clear}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-4">
          {/* Common fields */}
          <Section title="General">
            <Field label="ID" value={selectedItem.id} mono />
            <Field label="Name" value={selectedItem.name} />
            <Field label="Time" value={formatTs(selectedItem.startTime)} />
            <Field label="Duration" value={formatDur(selectedItem.durationMs)} />
            {selectedItem.status && (
              <Field label="Status" value={selectedItem.status} />
            )}
            <Field label="Label" value={selectedItem.subLabel} />
          </Section>

          <Separator />

          {/* Category-specific fields */}
          <CategoryDetails item={selectedItem} />
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Category-specific rendering ─────────────────────────────────────────────

function CategoryDetails({ item }: { item: TimelineItem }) {
  switch (item.category) {
    case "event":
      return <EventDetails data={item.raw as EventRow} />;
    case "span":
      return <SpanDetails data={item.raw as SpanRow} />;
    case "model_call":
      return <ModelCallDetails data={item.raw as ModelCallRow} />;
    case "tool_call":
      return <ToolCallDetails data={item.raw as ToolCallRow} />;
  }
}

function EventDetails({ data }: { data: EventRow }) {
  return (
    <>
      <Section title="Event">
        <Field label="Type" value={data.type} />
        <Field label="Parent ID" value={data.parentId ?? "—"} mono />
      </Section>
      {data.input != null && (
        <>
          <Separator />
          <Section title="Input">
            <JsonViewer data={data.input} defaultOpen />
          </Section>
        </>
      )}
      {data.output != null && (
        <>
          <Separator />
          <Section title="Output">
            <JsonViewer data={data.output} defaultOpen />
          </Section>
        </>
      )}
      {data.error != null && (
        <>
          <Separator />
          <Section title="Error">
            <JsonViewer data={data.error} defaultOpen />
          </Section>
        </>
      )}
      {data.metadata != null && (
        <>
          <Separator />
          <Section title="Metadata">
            <JsonViewer data={data.metadata} />
          </Section>
        </>
      )}
    </>
  );
}

function SpanDetails({ data }: { data: SpanRow }) {
  return (
    <>
      <Section title="Span">
        <Field label="Kind" value={data.kind} />
        <Field label="Status" value={data.status} />
        <Field label="Parent ID" value={data.parentId ?? "—"} mono />
        {data.endedAt && (
          <Field label="Ended" value={formatTs(data.endedAt)} />
        )}
      </Section>
      {data.attributes != null && (
        <>
          <Separator />
          <Section title="Attributes">
            <JsonViewer data={data.attributes} defaultOpen />
          </Section>
        </>
      )}
    </>
  );
}

function ModelCallDetails({ data }: { data: ModelCallRow }) {
  return (
    <>
      <Section title="Model Call">
        <Field label="Provider" value={data.provider} />
        <Field label="Model" value={data.model} />
        <Field
          label="Tokens"
          value={`${data.inputTokens ?? 0} in / ${data.outputTokens ?? 0} out (${data.totalTokens ?? 0} total)`}
        />
        {data.estimatedCostUsd != null && (
          <Field
            label="Est. Cost"
            value={`$${data.estimatedCostUsd.toFixed(4)}`}
          />
        )}
        {data.spanId && (
          <Field label="Span ID" value={data.spanId} mono />
        )}
      </Section>
      {data.messages != null && (
        <>
          <Separator />
          <Section title="Messages">
            <JsonViewer data={data.messages} defaultOpen />
          </Section>
        </>
      )}
      {data.prompt != null && (
        <>
          <Separator />
          <Section title="Prompt">
            <p className="whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs">
              {data.prompt.length > 2000
                ? data.prompt.slice(0, 2000) + "…"
                : data.prompt}
            </p>
          </Section>
        </>
      )}
      {data.response != null && (
        <>
          <Separator />
          <Section title="Response">
            <p className="whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-xs">
              {data.response.length > 2000
                ? data.response.slice(0, 2000) + "…"
                : data.response}
            </p>
          </Section>
        </>
      )}
      {data.metadata != null && (
        <>
          <Separator />
          <Section title="Metadata">
            <JsonViewer data={data.metadata} />
          </Section>
        </>
      )}
    </>
  );
}

function ToolCallDetails({ data }: { data: ToolCallRow }) {
  return (
    <>
      <Section title="Tool Call">
        <Field label="Tool" value={data.toolName} />
        <Field label="Status" value={data.status} />
        {data.spanId && (
          <Field label="Span ID" value={data.spanId} mono />
        )}
      </Section>
      {data.input != null && (
        <>
          <Separator />
          <Section title="Input">
            <JsonViewer data={data.input} defaultOpen />
          </Section>
        </>
      )}
      {data.output != null && (
        <>
          <Separator />
          <Section title="Output">
            <JsonViewer data={data.output} defaultOpen />
          </Section>
        </>
      )}
      {data.error != null && (
        <>
          <Separator />
          <Section title="Error">
            <JsonViewer data={data.error} defaultOpen />
          </Section>
        </>
      )}
      {data.metadata != null && (
        <>
          <Separator />
          <Section title="Metadata">
            <JsonViewer data={data.metadata} />
          </Section>
        </>
      )}
    </>
  );
}

// ── Reusable Primitives ────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`truncate text-right ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
