import { NextRequest, NextResponse } from "next/server";
import { getTracesList } from "../../../lib/queries";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const status = searchParams.get("status") || undefined;

    const result = await getTracesList({ limit, offset, status });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}