import { NextRequest, NextResponse } from "next/server";
import { getAnnotation, upsertAnnotation } from "../../../../../lib/queries";
import type { AnnotationInput } from "../../../../../lib/trace-types";
import { internalError } from "../../../../../lib/http-errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  try {
    const { traceId } = await params;
    const annotation = await getAnnotation(traceId);
    return NextResponse.json({ annotation });
  } catch (error: unknown) {
    return internalError(error);
  }
}

/** Validate and coerce a raw body into an AnnotationInput partial. */
function parseInput(body: unknown): AnnotationInput | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const input: AnnotationInput = {};

  if ("favorite" in b && b.favorite !== undefined) {
    if (typeof b.favorite !== "boolean") return { error: "favorite must be a boolean" };
    input.favorite = b.favorite;
  }
  if ("note" in b && b.note !== undefined) {
    if (b.note !== null && typeof b.note !== "string") {
      return { error: "note must be a string or null" };
    }
    input.note = b.note as string | null;
  }
  if ("tags" in b && b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== "string")) {
      return { error: "tags must be an array of strings" };
    }
    input.tags = b.tags as string[];
  }
  return input;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  try {
    const { traceId } = await params;
    const body = await request.json();
    const parsed = parseInput(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const annotation = await upsertAnnotation(traceId, parsed);
    if (!annotation) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }
    return NextResponse.json({ annotation });
  } catch (error: unknown) {
    return internalError(error);
  }
}
