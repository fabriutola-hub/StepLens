/**
 * Internal helpers shared by the SDK integrations. Not part of the public API.
 *
 * All integrations follow the same contract:
 * - structural types only — no runtime dependency on provider SDKs;
 * - calls made outside a `record()` run pass through untouched;
 * - streams are recorded when the consumer finishes them, never auto-drained.
 */
import type { ModelMessage, MessageRole, ModelProvider } from "@agent-replay/core";

export const KNOWN_ROLES = new Set<MessageRole>(["system", "user", "assistant", "tool"]);

/** Coerce loosely-shaped chat messages into `ModelMessage[]`. */
export function coerceMessages(
  messages: Array<{ role?: string; content?: unknown }> | undefined,
): ModelMessage[] | undefined {
  if (!Array.isArray(messages)) return undefined;
  return messages.map((m) => {
    const role = (m.role && KNOWN_ROLES.has(m.role as MessageRole)
      ? m.role
      : "user") as MessageRole;
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return { role, content };
  });
}

/** Minimal error info for model-call metadata. */
export function errInfo(err: unknown): { name: string; message: string } {
  return err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: "Error", message: String(err) };
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Record<symbol, unknown>)[Symbol.asyncIterator] === "function"
  );
}

/** Map a free-form provider name (e.g. `"openai.chat"`) to a known provider. */
export function providerFromName(name: string | undefined): ModelProvider {
  if (!name) return "custom";
  const head = name.toLowerCase().split(/[.:/]/)[0];
  if (head === "openai") return "openai";
  if (head === "anthropic") return "anthropic";
  if (head === "google" || head === "gemini" || head.startsWith("google-")) return "google";
  if (head === "ollama") return "ollama";
  return "custom";
}
