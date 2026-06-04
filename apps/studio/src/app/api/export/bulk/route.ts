import { NextRequest, NextResponse } from "next/server";
import { listTraceExports } from "../../../../lib/queries";
import { buildZip, jsonBytes } from "../../../../lib/zip";
import { internalError } from "../../../../lib/http-errors";

const MAX_IDS = 1000;

/**
 * Bulk export endpoint. Returns a `Content-Type: application/zip` archive with
 * one `<traceId>.json` file per requested id, plus a `_manifest.json` index.
 *
 * GET is for browser-friendly downloads: `?ids=a,b,c` (CSV-friendly).
 * POST accepts a JSON body for callers that already have a parsed array.
 */
async function handle(ids: string[]): Promise<NextResponse | Response> {
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 }
    );
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Cannot export more than ${MAX_IDS} traces in one request` },
      { status: 400 }
    );
  }

  const exports = await listTraceExports(ids);
  const found = new Set(exports.map((e) => e.trace.id));
  const missing = ids.filter((id) => !found.has(id));

  const manifest = {
    version: "1.0.0",
    generatedAt: Date.now(),
    requested: ids.length,
    exported: exports.length,
    missing,
  };

  const entries = exports.map((bundle) => ({
    name: `traces/${bundle.trace.id}.json`,
    data: jsonBytes(bundle),
  }));
  entries.push({ name: "_manifest.json", data: jsonBytes(manifest) });

  const zip = buildZip(entries);
  // Next 16's `NextResponse` type is built on `ResponseInit.body: BodyInit`,
  // which (in current @types/dom) only accepts string | FormData | Blob | etc.
  // Our ZIP is already a `Buffer` (Uint8Array subclass); cast through `unknown`
  // to `BodyInit`. At runtime, Node's `Response` accepts any `Uint8Array`.
  const body = zip as unknown as BodyInit;

  const filename = `steplens-bulk-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.zip`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": zip.length.toString(),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return await handle(ids);
  } catch (error: unknown) {
    return internalError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }
    if (body.ids.some((v: unknown) => typeof v !== "string" || !v)) {
      return NextResponse.json({ error: "ids must be non-empty strings" }, { status: 400 });
    }
    return await handle(body.ids as string[]);
  } catch (error: unknown) {
    return internalError(error);
  }
}
