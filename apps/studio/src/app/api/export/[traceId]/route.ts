import { NextRequest, NextResponse } from "next/server";
import { getTraceDetail } from "../../../../lib/queries";

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

    const exportData = {
      version: "1.0.0",
      exportedAt: Date.now(),
      ...detail,
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="trace-${traceId}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}