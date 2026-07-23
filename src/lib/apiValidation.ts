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

/**
 * A @unique field collision (duplicate username, email, coupon code, …)
 * should be a clean 409 with a specific message, not an unhandled 500 — the
 * documented way to detect this is `e.code === "P2002"`, and every such
 * catch in this app originally checked only that. In practice, this app's
 * Prisma setup (the libSQL/Turso driver-adapters preview) never actually
 * produces P2002 for a unique-constraint violation — it leaks the raw
 * driver error through instead (`code: "SQLITE_CONSTRAINT"`, message
 * containing "UNIQUE constraint failed"), so every one of those catches was
 * silently dead code, and every duplicate-key attempt crashed as an
 * unhandled 500. Found via adversarial testing (POST a duplicate username),
 * not user-reported. Checking both shapes here keeps this correct whether a
 * future Prisma/driver-adapter version starts populating P2002 properly.
 */
export function isUniqueConstraintError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null | undefined;
  if (!err) return false;
  return err.code === "P2002" || (err.code === "SQLITE_CONSTRAINT" && !!err.message?.includes("UNIQUE constraint failed"));
}
