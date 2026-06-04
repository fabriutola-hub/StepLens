import { NextRequest, NextResponse } from "next/server";
import { getTracesList } from "../../../lib/queries";
import { parseTraceParams } from "../../../lib/parse-filters";
import { internalError } from "../../../lib/http-errors";

export async function GET(request: NextRequest) {
  try {
    const params = parseTraceParams(request.nextUrl.searchParams);
    const result = await getTracesList(params);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return internalError(error);
  }
}
