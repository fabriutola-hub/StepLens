import { AgentReplayClient, type AgentReplayClientOptions } from "./client.js";
import { HttpCollector, type HttpCollectorOptions } from "./http-collector.js";
import { MemoryCollector } from "./collector.js";

/** Default Studio endpoint. Studio serves both the UI and the ingest API here. */
export const DEFAULT_ENDPOINT = "http://localhost:3000";

/**
 * Options for the convenience factory.
 *
 * The common case is `createClient()` (or `createClient({ endpoint })`), which
 * records to a running Studio instance over HTTP. Pass a custom `collector`
 * (e.g. `MemoryCollector`) for offline/testing usage.
 */
export interface CreateClientOptions extends AgentReplayClientOptions {
  /**
   * Base URL of the Studio API. This is the primary, recommended option.
   *
   * Resolution order: `endpoint` → `http.baseUrl` → `AGENT_REPLAY_ENDPOINT`
   * → {@link DEFAULT_ENDPOINT}.
   */
  endpoint?: string;

  /**
   * Advanced: full {@link HttpCollectorOptions} (batch size, flush interval,
   * retries, error callbacks). `endpoint` takes precedence over `http.baseUrl`.
   */
  http?: HttpCollectorOptions;
}

/** Read an environment variable, tolerating non-Node runtimes. */
export function readEnv(name: string): string | undefined {
  return typeof process !== "undefined" && process.env
    ? process.env[name]
    : undefined;
}

/** Interpret a boolean-ish env value. Anything but "false"/"0"/"" is true. */
export function envEnabled(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "off" || v === "") {
    return false;
  }
  return true;
}

/**
 * Create an {@link AgentReplayClient} that records to Studio over HTTP.
 *
 * Reads `AGENT_REPLAY_ENDPOINT` and `AGENT_REPLAY_ENABLED` from the environment.
 * Remember to call `await client.shutdown()` before your process exits so the
 * last batch of events is flushed.
 *
 * @example Recommended
 * ```ts
 * import { createClient } from "@agent-replay/sdk";
 *
 * const replay = createClient(); // records to http://localhost:3000
 * await replay.run("my-agent", async (trace) => {
 *   // ... instrument your agent ...
 * });
 * await replay.shutdown();
 * ```
 *
 * @example Explicit endpoint
 * ```ts
 * const replay = createClient({ endpoint: "http://localhost:3000" });
 * ```
 *
 * @example Offline / testing (in-memory)
 * ```ts
 * import { createClient, MemoryCollector } from "@agent-replay/sdk";
 * const replay = createClient({ collector: new MemoryCollector() });
 * ```
 */
export function createClient(
  options: CreateClientOptions = {},
): AgentReplayClient {
  // Resolve enabled: explicit option → AGENT_REPLAY_ENABLED → default true.
  const enabled =
    options.enabled ?? envEnabled(readEnv("AGENT_REPLAY_ENABLED")) ?? true;

  // A caller-supplied collector always wins.
  if (options.collector) {
    return new AgentReplayClient({ ...options, enabled });
  }

  // When disabled, skip HTTP entirely (no timers, no network) — use a
  // throwaway in-memory collector so the client API stays a no-op.
  if (!enabled) {
    return new AgentReplayClient({
      collector: new MemoryCollector(),
      enabled: false,
    });
  }

  // Resolve the endpoint and record to Studio over HTTP.
  const endpoint =
    options.endpoint ??
    options.http?.baseUrl ??
    readEnv("AGENT_REPLAY_ENDPOINT") ??
    DEFAULT_ENDPOINT;

  const collector = new HttpCollector({ ...options.http, baseUrl: endpoint });
  return new AgentReplayClient({ ...options, collector, enabled });
}
