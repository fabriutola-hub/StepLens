/**
 * Shared HTTP error helpers for /api/* route handlers.
 *
 * Studio runs locally and is single-user, so we don't try to do error class
 * taxonomies or RFC-7807 problem details — we just want every handler to
 * surface the same JSON shape on a thrown error.
 */
import { NextResponse } from "next/server";

/** Extract a human-readable message from an unknown thrown value. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error === undefined) return "undefined";
  if (error === null) return "null";
  try {
    const s = JSON.stringify(error);
    return s ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
}

/** Standard JSON envelope for handler exceptions. */
export function internalError(error: unknown, status = 500): NextResponse {
  return NextResponse.json(
    { error: "Internal server error", details: messageOf(error) },
    { status }
  );
}
