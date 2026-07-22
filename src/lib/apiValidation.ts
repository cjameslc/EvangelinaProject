import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * A malformed request body (missing field, empty required string, wrong
 * type) should be a clean 400 with the validation message, not an unhandled
 * ZodError bubbling into Next.js's default 500. Scoped to the booking
 * mutation endpoints for now — schema.parse(await req.json()) is the
 * app-wide convention elsewhere and changing that everywhere is a separate,
 * broader cleanup outside this pass.
 */
export function parseOrError<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, response: NextResponse.json({ error: result.error.errors[0]?.message ?? "Invalid request." }, { status: 400 }) };
  }
  return { ok: true, data: result.data };
}
