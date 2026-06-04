/**
 * OpenAI integration — `@agent-replay/sdk/integrations/openai`.
 *
 * Wrap an OpenAI client so that `chat.completions.create` and `responses.create`
 * calls made **inside** a `record()` run are recorded as model calls. Outside a
 * run, calls pass through untouched.
 *
 * No dependency on the `openai` package — uses structural types only.
 *
 * ```ts
 * import { createReplay } from "@agent-replay/sdk/simple";
 * import { wrapOpenAI } from "@agent-replay/sdk/integrations/openai";
 * import OpenAI from "openai";
 *
 * const replay = createReplay();
 * const openai = wrapOpenAI(new OpenAI(), { replay });
 *
 * await replay.record("OpenAI Agent", async () => {
 *   await openai.chat.completions.create({
 *     model: "gpt-4o-mini",
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 * });
 * await replay.shutdown();
 * ```
 */
import type { ModelMessage, MessageRole } from "@agent-replay/core";
import { getRunContext } from "../context.js";
import type { Replay } from "../simple.js";

export interface WrapOpenAIOptions {
  /**
   * The {@link Replay} you're recording with. Reserved for clarity and future
   * use — recording is driven by the active `record()` context, so calls made
   * outside a run pass through regardless.
   */
  replay?: Replay;
}

// ── Structural response shapes (no `openai` types) ────────────────────────────

interface ChatCreateArgs {
  model?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
  [k: string]: unknown;
}
interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  [k: string]: unknown;
}
interface ResponsesCreateArgs {
  model?: string;
  input?: unknown;
  instructions?: string;
  [k: string]: unknown;
}
interface ResponsesResponse {
  output_text?: string;
  output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
  [k: string]: unknown;
}

const KNOWN_ROLES = new Set<MessageRole>(["system", "user", "assistant", "tool"]);

function coerceMessages(
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

function errInfo(err: unknown): { name: string; message: string } {
  return err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: "Error", message: String(err) };
}

/** Pull text out of a `responses.create` result without the SDK's types. */
function extractResponsesText(res: ResponsesResponse): string | undefined {
  if (typeof res.output_text === "string") return res.output_text;
  // Fallback: scan output items for text content.
  const output = res.output as unknown;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const content = (item as { content?: unknown })?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = (c as { text?: unknown })?.text;
          if (typeof t === "string") parts.push(t);
        }
      }
    }
    if (parts.length) return parts.join("");
  }
  return undefined;
}

type AnyCreate = (args: unknown, ...rest: unknown[]) => Promise<unknown>;

function wrapCreate(original: AnyCreate, kind: "chat" | "responses"): AnyCreate {
  return async function wrapped(args: unknown, ...rest: unknown[]) {
    const ctx = getRunContext();
    if (!ctx) {
      // Outside a record() run — pass through, record nothing.
      return original(args, ...rest);
    }

    const { trace, parentId } = ctx;
    const argObj = args && typeof args === "object" ? (args as { model?: unknown }) : {};
    const model = typeof argObj.model === "string" ? argObj.model : "unknown";
    const span = trace.startSpan(model, { kind: "model", parentId });

    try {
      const res = await original(args, ...rest);
      if (kind === "chat") {
        const a = (args ?? {}) as ChatCreateArgs;
        const r = (res ?? {}) as ChatResponse;
        trace.recordModelCall({
          provider: "openai",
          model,
          messages: coerceMessages(a.messages),
          response: r.choices?.[0]?.message?.content ?? undefined,
          inputTokens: r.usage?.prompt_tokens,
          outputTokens: r.usage?.completion_tokens,
          spanId: span.id,
        });
      } else {
        const a = (args ?? {}) as ResponsesCreateArgs;
        const r = (res ?? {}) as ResponsesResponse;
        trace.recordModelCall({
          provider: "openai",
          model,
          prompt: typeof a.input === "string" ? a.input : undefined,
          messages:
            typeof a.input !== "string"
              ? coerceMessages(a.input as Array<{ role?: string; content?: unknown }>)
              : undefined,
          response: extractResponsesText(r),
          inputTokens: r.usage?.input_tokens,
          outputTokens: r.usage?.output_tokens,
          spanId: span.id,
        });
      }
      span.end();
      return res;
    } catch (err) {
      trace.recordModelCall({
        provider: "openai",
        model,
        spanId: span.id,
        metadata: { error: errInfo(err) },
      });
      span.fail(err instanceof Error ? err : String(err));
      throw err;
    }
  };
}

function wrapResource(
  resource: object,
  wrapKey: string,
  kind: "chat" | "responses",
): object {
  return new Proxy(resource, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (prop === wrapKey && typeof value === "function") {
        return wrapCreate((value as Function).bind(target) as AnyCreate, kind);
      }
      return value;
    },
  });
}

/**
 * Wrap an OpenAI client. Returns a transparent proxy: everything works as
 * before, but `chat.completions.create` and `responses.create` record model
 * calls when invoked inside a `record()` run.
 */
export function wrapOpenAI<T extends object>(
  client: T,
  _options?: WrapOpenAIOptions,
): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = (target as Record<string | symbol, unknown>)[prop];

      if (prop === "chat" && value && typeof value === "object") {
        // chat.completions.create
        return new Proxy(value as object, {
          get(chatTarget, chatProp) {
            const chatValue = (chatTarget as Record<string | symbol, unknown>)[chatProp];
            if (chatProp === "completions" && chatValue && typeof chatValue === "object") {
              return wrapResource(chatValue as object, "create", "chat");
            }
            return chatValue;
          },
        });
      }

      if (prop === "responses" && value && typeof value === "object") {
        return wrapResource(value as object, "create", "responses");
      }

      return value;
    },
  }) as T;
}
