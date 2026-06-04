import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "../../../db/connection";
import { traces } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { internalError } from "../../../lib/http-errors";

/**
 * Activity histogram — one bucket per local day, count of traces started
 * in that day. Used by the Workbench heat map.
 *
 * Query params:
 *   from — epoch ms; defaults to (today - 12 weeks)
 *   to   — epoch ms; defaults to (now)
 *   tz   — minutes east of UTC (default: 0). Buckets are aligned to local
 *          midnight at the requested offset.
 */
const DAY_MS = 86_400_000;

function parseOffsetMinutes(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < -14 * 60 || n > 14 * 60) return 0;
  return Math.floor(n);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const tz = parseOffsetMinutes(params.get("tz"));

    const now = Date.now();
    const to = Number(params.get("to")) || now;
    // 12 weeks = 84 days. Round to a full week boundary for tidy grid output.
    const rawFrom = Number(params.get("from")) || to - 84 * DAY_MS;
    const from = Math.min(rawFrom, to - 7 * DAY_MS);

    const db = getDatabase();
    // SQLite stores epoch ms; bucket by (startedAt + tzOffset) / DAY, floored.
    // Adding tzOffset minutes before flooring shifts the bucket boundary to
    // the user's local midnight without us touching SQL date functions.
    const tzShiftMs = tz * 60_000;
    const rows = db
      .select({
        // SQLite is doing integer math here. (x + y) / 86400000 is exact.
        // Use raw `sql` template because Drizzle can't auto-aggregate a
        // computed expression in `groupBy` without an alias; the alias is
        // the same as the column name.
        bucket: sql<number>`cast((started_at + ${tzShiftMs}) / 86400000 as integer)`.as("bucket"),
        count: sql<number>`count(*)`.as("count"),
      })
      .from(traces)
      .where(
        sql`started_at >= ${from - tzShiftMs} AND started_at <= ${to - tzShiftMs}`
      )
      .groupBy(sql`bucket`);

    // Drizzle's strict typing makes it hard to group by a freshly-aliased
    // expression; the `bucket` SQL fragment above is the same expression as
    // the SELECT alias, so grouping by it works at the SQLite level.

    const result = rows.all();
    const counts: Record<string, number> = {};
    for (const r of result) {
      counts[String(r.bucket)] = Number(r.count);
    }

    // We also need a `fromBucket` so the frontend can render empty cells
    // without recomputing the offset.
    const fromBucket = Math.floor((from + tzShiftMs) / DAY_MS);
    const toBucket = Math.floor((to + tzShiftMs) / DAY_MS);

    return NextResponse.json(
      {
        from,
        to,
        fromBucket,
        toBucket,
        tz,
        counts,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=30",
        },
      }
    );
  } catch (error: unknown) {
    return internalError(error);
  }
}
