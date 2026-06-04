import { AsyncLocalStorage } from "node:async_hooks";
import type { Trace } from "./trace.js";

/**
 * Ambient recording context for the duration of a `record()` call (and any
 * nested `step()`). Integrations like `wrapOpenAI` read this to attach model
 * calls to the active trace without the user threading a `run` object around.
 */
export interface RunContext {
  /** The active trace. */
  trace: Trace;
  /** Span id to parent newly-created spans under, if any. */
  parentId?: string;
}

/** Process-wide store for the active {@link RunContext}. */
export const runContext = new AsyncLocalStorage<RunContext>();

/** Get the active recording context, or `undefined` outside of `record()`. */
export function getRunContext(): RunContext | undefined {
  return runContext.getStore();
}
