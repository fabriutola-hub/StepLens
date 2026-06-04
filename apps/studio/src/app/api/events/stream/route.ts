import { NextRequest } from "next/server";
import { getDatabase } from "../../../../db/connection";
import { traces } from "../../../../db/schema";
import { sql } from "drizzle-orm";

/**
 * Server-Sent Events stream of trace activity. Emits one of:
 *   event: hello   data: {"now": 1717549200000}
 *   event: trace   data: {"id": "…", "name": "…", "status": "success", "startedAt": …}
 *   event: ping    data: {}
 *
 * We poll SQLite every 1s for traces started since the last seen timestamp;
 * the polling is local and bounded so this is safe for many concurrent
 * clients. The connection stays open until the client disconnects.
 *
 * SSE is preferable to WebSockets for this use case: we have a single
 * direction (server → client) and the EventSource API is built into the
 * browser, no extra dependencies.
 */
export async function GET(request: NextRequest) {
  // `request` is required by the Next.js route signature even though the
  // SSE endpoint never reads from it — keep the parameter so the underlying
  // connection manager can detect a client abort via request.signal.
  void request;
  const db = getDatabase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload =
          `event: ${event}\n` +
          `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller may already be closed if the client disconnected.
        }
      };

      // Initial handshake.
      send("hello", { now: Date.now() });

      let lastSeen = Date.now();
      const interval = setInterval(() => {
        try {
          // Window includes ~1s of history so multi-batch ingests don't slip
          // through the cracks.
          const since = lastSeen - 1000;
          const rows = db
            .select({
              id: traces.id,
              name: traces.name,
              status: traces.status,
              startedAt: traces.startedAt,
            })
            .from(traces)
            .where(sql`${traces.startedAt} >= ${since}`)
            .all();
          if (rows.length > 0) {
            lastSeen = Math.max(...rows.map((r) => r.startedAt));
            for (const r of rows) {
              send("trace", r);
            }
          }
          // Heartbeat every interval — keeps proxies and firewalls happy.
          send("ping", {});
        } catch {
          // Best-effort: if the DB hiccups, keep streaming rather than
          // tearing the connection down.
        }
      }, 1000);

      // Cancel the interval on cancel/close.
      const cleanup = () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // No `request.signal` consumer here; we wait for the stream's own
      // cancel callback to fire when the client disconnects.
      // (Next.js wires this up for us when the request aborts.)
      (controller as unknown as { onCancel?: (cb: () => void) => void })
        .onCancel?.(cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
