import { NextRequest, NextResponse } from "next/server";
import { getTracesStats } from "../../../../lib/queries";
import { parseTraceParams } from "../../../../lib/parse-filters";
import { internalError } from "../../../../lib/http-errors";

export async function GET(request: NextRequest) {
  try {
    // Stats apply the same filters as the list; paging/sort are ignored.
    const { limit, offset, sort, order, ...filters } = parseTraceParams(
      request.nextUrl.searchParams
    );
    void limit;
    void offset;
    void sort;
    void order;
    const stats = await getTracesStats(filters);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    return internalError(error);
  }
}
