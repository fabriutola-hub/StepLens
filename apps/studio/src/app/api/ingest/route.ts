import { NextRequest, NextResponse } from "next/server";
import { batchIngestSchema } from "@agent-replay/core";
import { insertBatchEvents } from "../../../lib/queries";
import { internalError } from "../../../lib/http-errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = batchIngestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: validation.error.issues },
        { status: 400 }
      );
    }

    const result = await insertBatchEvents(validation.data);

    return NextResponse.json({
      ok: result.errors.length === 0,
      inserted: result.accepted.length,
      updated: 0,
      errors: result.errors.length > 0 ? result.errors : undefined,
      total: validation.data.events.length,
    });
  } catch (error: unknown) {
    return internalError(error);
  }
}
