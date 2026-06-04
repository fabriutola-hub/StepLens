import type { AgentReplayClient } from "@agent-replay/sdk";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * "Failing Agent" — demonstrates error handling and recovery:
 *   Tool call throws, error recorded, recovery attempted, ultimately fails.
 *   4 spans, 2 model calls, 1 tool call, 2 error events.
 */
export async function runFailingAgent(client: AgentReplayClient) {
  const trace = client.startTrace("Failing Agent", {
    input: "Load user profile from database and enrich with external API data",
    metadata: { agent: "profile-enricher-v1" },
  });

  // ── Phase 1: Initialize ────────────────────────────────────────────
  const initSpan = trace.startSpan("initialize", {
    kind: "agent",
  });

  const initModelSpan = trace.startSpan("gpt-4o_init", {
    kind: "model",
    parentId: initSpan.id,
  });
  await sleep(300);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Plan the steps to load and enrich a user profile." },
      { role: "user", content: "Load user profile for user_id=42 and enrich with Clearbit data." },
    ],
    response: "Plan:\n1. Read user data from database\n2. Extract email domain\n3. Call Clearbit enrichment API\n4. Merge and return enriched profile",
    inputTokens: 80,
    outputTokens: 45,
    spanId: initModelSpan.id,
  });
  initModelSpan.end();
  initSpan.end();

  // ── Phase 2: Read database (fails) ─────────────────────────────────
  const dbReadSpan = trace.startSpan("read_database", {
    kind: "tool",
    parentId: initSpan.id,
  });
  await sleep(400);

  // Simulate a database read error
  const dbError = new Error("Connection refused: database replica at db-primary.internal:5432 is unreachable after 30s timeout");
  dbError.name = "DatabaseConnectionError";

  trace.recordToolCall({
    toolName: "database_query",
    input: { query: "SELECT * FROM users WHERE id = 42", host: "db-primary.internal:5432" },
    output: undefined,
    status: "error",
    spanId: dbReadSpan.id,
    error: dbError,
  });
  dbReadSpan.fail(dbError);
  trace.recordError(dbError, {
    metadata: { severity: "critical", retryable: true },
  });

  trace.recordEvent("error", "database_read_failed", {
    input: { host: "db-primary.internal:5432", timeout: "30000ms" },
    parentId: dbReadSpan.id,
  });

  // ── Phase 3: Recovery attempt ──────────────────────────────────────
  const recoverySpan = trace.startSpan("recovery_attempt", {
    kind: "agent",
    parentId: initSpan.id,
  });

  const recoveryModelSpan = trace.startSpan("gpt-4o_recovery", {
    kind: "model",
    parentId: recoverySpan.id,
  });
  await sleep(500);
  trace.recordModelCall({
    provider: "openai",
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Suggest recovery strategies for a database connection failure." },
      { role: "user", content: "Database connection to db-primary.internal:5432 failed after 30s. User id=42. Suggest recovery." },
    ],
    response: "Recovery options:\n1. Retry with exponential backoff (3 attempts)\n2. Fallback to read-replica db-replica.internal:5433\n3. Use cached user data (stale-while-revalidate)\n4. Return partial profile with degraded enrichment",
    inputTokens: 95,
    outputTokens: 60,
    spanId: recoveryModelSpan.id,
  });
  recoveryModelSpan.end();

  // Attempt fallback — also fails
  const fallbackSpan = trace.startSpan("fallback_read", {
    kind: "tool",
    parentId: recoverySpan.id,
  });
  await sleep(300);

  const fallbackError = new Error("Fallback replica also unreachable: db-replica.internal:5433 — ECONNREFUSED");
  fallbackError.name = "FallbackExhaustedError";

  trace.recordToolCall({
    toolName: "database_query",
    input: { query: "SELECT * FROM users WHERE id = 42", host: "db-replica.internal:5433" },
    output: undefined,
    status: "error",
    spanId: fallbackSpan.id,
    error: fallbackError,
  });
  fallbackSpan.fail(fallbackError);
  trace.recordError(fallbackError, {
    metadata: { severity: "critical", retryable: false, exhausted: true },
  });

  recoverySpan.fail("All recovery strategies exhausted — database cluster unavailable");
  trace.recordEvent("log", "recovery_exhausted", {
    input: { attempted: ["primary", "replica"], status: "all failed" },
    parentId: recoverySpan.id,
  });

  // End trace as failed
  trace.fail("Failed to load user profile: database cluster unreachable after exhausting primary and replica connections");
  return trace.id;
}
