import { NextRequest, NextResponse } from "next/server";
import { compareTraces } from "../../../lib/queries";
import { internalError } from "../../../lib/http-errors";

export async function GET(request: NextRequest) {
  try {
    const left = request.nextUrl.searchParams.get("left");
    const right = request.nextUrl.searchParams.get("right");

    if (!left || !right) {
      return NextResponse.json(
        { error: "Both 'left' and 'right' trace ids are required" },
        { status: 400 }
      );
    }

    const result = await compareTraces(left, right);
    if (!result) {
      return NextResponse.json(
        { error: "One or both traces were not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return internalError(error);
  }
}
