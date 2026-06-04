import { NextRequest, NextResponse } from "next/server";
import { createSavedView, listSavedViews } from "../../../lib/queries";
import type { TraceFilters } from "../../../lib/trace-types";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET() {
  try {
    const views = await listSavedViews();
    return NextResponse.json({ views });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: "Internal server error", details: messageOf(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const filters: TraceFilters =
      body?.filters && typeof body.filters === "object" ? body.filters : {};

    const view = await createSavedView(name, filters);
    return NextResponse.json({ view }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: "Internal server error", details: messageOf(error) },
      { status: 500 }
    );
  }
}
