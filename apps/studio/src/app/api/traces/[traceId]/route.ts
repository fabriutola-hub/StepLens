import { NextRequest, NextResponse } from "next/server";
import { getTraceDetail, deleteTrace } from "../../../../lib/queries";
import { internalError } from "../../../../lib/http-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  try {
    const { traceId } = await params;
    const detail = await getTraceDetail(traceId);

    if (!detail) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: unknown) {
    return internalError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  try {
    const { traceId } = await params;
    const deleted = await deleteTrace(traceId);

    if (!deleted) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, traceId });
  } catch (error: unknown) {
    return internalError(error);
  }
}
