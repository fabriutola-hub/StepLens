import { NextResponse } from "next/server";
import { CORE_VERSION } from "@agent-replay/core";
import { getDatabase } from "../../../db/connection";
import { traces } from "../../../db/schema";
import { count } from "drizzle-orm";

// We capture the boot time once per Node process. Studio's dev server reloads
// the module on most file changes, so this is "process uptime" in spirit, not
// "uptime since OS boot" — that's the right semantic for `/api/health`.
const BOOT_TIME_MS = Date.now();

interface HealthBody {
  status: "ok" | "degraded" | "down";
  service: "steplens-studio";
  version: string;
  uptimeMs: number;
  startedAt: number;
  db: {
    connected: boolean;
    traceCount?: number;
    error?: string;
  };
}

/**
 * Lightweight health probe — safe for Docker `HEALTHCHECK`, Kubernetes
 * readiness probes, and uptime monitors. Returns 200 when the database is
 * reachable, 503 otherwise so cluster managers route around a broken pod.
 */
export async function GET() {
  const startedAt = BOOT_TIME_MS;
  const uptimeMs = Date.now() - startedAt;

  let dbConnected = false;
  let traceCount: number | undefined;
  let dbError: string | undefined;

  try {
    const db = getDatabase();
    const rows = await db.select({ value: count() }).from(traces);
    traceCount = rows[0]?.value ?? 0;
    dbConnected = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const body: HealthBody = {
    status: dbConnected ? "ok" : "down",
    service: "steplens-studio",
    version: CORE_VERSION,
    uptimeMs,
    startedAt,
    db: {
      connected: dbConnected,
      ...(traceCount !== undefined ? { traceCount } : {}),
      ...(dbError ? { error: dbError } : {}),
    },
  };

  return NextResponse.json(body, {
    status: dbConnected ? 200 : 503,
    headers: {
      // No caching — health must always reflect the current moment.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
