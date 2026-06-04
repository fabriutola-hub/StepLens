import { NextRequest, NextResponse } from "next/server";
import { bulkDeleteTraces, bulkUpdateTags } from "../../../../lib/queries";
import { internalError } from "../../../../lib/http-errors";

const MAX_IDS = 1000;

function parseIds(body: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.ids)) return { ok: false, error: "ids must be an array of strings" };
  if (b.ids.some((v) => typeof v !== "string" || !v)) {
    return { ok: false, error: "ids must be non-empty strings" };
  }
  if (b.ids.length === 0) return { ok: false, error: "ids must not be empty" };
  if (b.ids.length > MAX_IDS) {
    return { ok: false, error: `Cannot operate on more than ${MAX_IDS} ids at once` };
  }
  return { ok: true, ids: b.ids as string[] };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseIds(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const op = (body as { op?: unknown })?.op;

    if (op === "delete") {
      const deleted = await bulkDeleteTraces(parsed.ids);
      return NextResponse.json({ ok: true, deleted });
    }

    if (op === "tag") {
      const tagOp = (body as { tagOp?: unknown })?.tagOp;
      const tag = ((body as { tag?: unknown })?.tag ?? "").toString().trim();
      if (tagOp !== "add" && tagOp !== "remove") {
        return NextResponse.json({ error: "tagOp must be 'add' or 'remove'" }, { status: 400 });
      }
      if (!tag) {
        return NextResponse.json({ error: "tag must be a non-empty string" }, { status: 400 });
      }
      const written = await bulkUpdateTags(parsed.ids, tagOp, tag);
      return NextResponse.json({ ok: true, written, tag, tagOp });
    }

    return NextResponse.json(
      { error: "op must be one of: 'delete', 'tag'" },
      { status: 400 }
    );
  } catch (error: unknown) {
    return internalError(error);
  }
}
