import { NextRequest, NextResponse } from "next/server";
import { traceExportSchema } from "@agent-replay/core";
import { importTrace } from "../../../lib/queries";

export async function POST(request: NextRequest) {
  try {
    const replace = request.nextUrl.searchParams.get("replace") === "true";

    const body = await request.json();
    const validation = traceExportSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid trace bundle", details: validation.error.issues },
        { status: 400 }
      );
    }

    const result = await importTrace(validation.data, { replace });

    if (result.conflict) {
      return NextResponse.json(
        {
          error: "Trace already exists",
          traceId: result.traceId,
          hint: "Re-send with ?replace=true to overwrite it.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, traceId: result.traceId, replaced: replace });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
