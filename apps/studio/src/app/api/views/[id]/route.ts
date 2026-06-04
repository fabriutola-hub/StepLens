import { NextRequest, NextResponse } from "next/server";
import { deleteSavedView, updateSavedView } from "../../../../lib/queries";
import type { TraceFilters } from "../../../../lib/trace-types";
import { internalError } from "../../../../lib/http-errors";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const patch: { name?: string; filters?: TraceFilters } = {};
    if (typeof body?.name === "string") patch.name = body.name.trim();
    if (body?.filters && typeof body.filters === "object") {
      patch.filters = body.filters;
    }

    const view = await updateSavedView(id, patch);
    if (!view) {
      return NextResponse.json({ error: "View not found" }, { status: 404 });
    }
    return NextResponse.json({ view });
  } catch (error: unknown) {
    return internalError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteSavedView(id);
    if (!deleted) {
      return NextResponse.json({ error: "View not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error: unknown) {
    return internalError(error);
  }
}
