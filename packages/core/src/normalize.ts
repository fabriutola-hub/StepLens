import { randomUUID } from "node:crypto";
import { createEventSchema, type CreateEventInput } from "./schemas.js";
import type { ReplayEvent } from "./types.js";
import type { z } from "zod";

// ── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generate a unique ID using crypto.randomUUID().
 * Returns a standard 36-character UUID v4 string.
 */
export function generateId(): string {
  return randomUUID();
}

// ── Normalization Result ─────────────────────────────────────────────────────

export type NormalizeResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

// ── Event Normalization ──────────────────────────────────────────────────────

/**
 * Normalize a raw event payload into a fully validated ReplayEvent.
 *
 * - Generates an `id` via `crypto.randomUUID()` if not provided.
 * - Sets `timestamp` to `Date.now()` if not provided.
 * - Validates the result against the Zod event schema.
 */
export function normalizeEvent(raw: unknown): NormalizeResult<ReplayEvent> {
  // Coerce into the create-event shape
  const input: CreateEventInput =
    typeof raw === "object" && raw !== null
      ? (raw as CreateEventInput)
      : ({} as CreateEventInput);

  // Apply defaults
  const withDefaults = {
    ...input,
    id: input.id ?? generateId(),
    timestamp: input.timestamp ?? Date.now(),
  };

  // Validate through the create schema first
  const parsed = createEventSchema.safeParse(withDefaults);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  // Construct the full ReplayEvent (all fields required)
  const event: ReplayEvent = {
    id: parsed.data.id ?? generateId(),
    traceId: parsed.data.traceId,
    parentId: parsed.data.parentId,
    type: parsed.data.type,
    name: parsed.data.name,
    timestamp: parsed.data.timestamp ?? Date.now(),
    durationMs: parsed.data.durationMs,
    input: parsed.data.input,
    output: parsed.data.output,
    error: parsed.data.error,
    metadata: parsed.data.metadata,
  };

  return { success: true, data: event };
}

/**
 * Normalize an Error-like value into a ReplayError shape.
 */
export function normalizeError(err: unknown): {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
} {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    };
  }
  if (typeof err === "string") {
    return { name: "Error", message: err };
  }
  return { name: "UnknownError", message: String(err) };
}

/**
 * Calculate duration in milliseconds between two epoch-ms timestamps.
 * Returns undefined if either value is missing.
 */
export function calculateDuration(
  startedAt: number | undefined,
  endedAt: number | undefined,
): number | undefined {
  if (startedAt == null || endedAt == null) return undefined;
  return endedAt - startedAt;
}
