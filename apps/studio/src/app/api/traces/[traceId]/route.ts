import { NextRequest, NextResponse } from "next/server";
import { getTraceDetail, deleteTrace } from "../../../../lib/queries";

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
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
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
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}