import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { getDefaultOwnerId } from "@/lib/ownerScope";
import { settingsSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const settings = await prisma.settings.upsert({ where: { ownerId: user.ownerId! }, update: {}, create: { ownerId: user.ownerId! } });
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  const parsed = parseOrError(settingsSchema.partial(), await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  // Low-frequency admin action — worth the extra query for a real
  // before-snapshot of just the fields this edit touches.
  const priorSettings = await prisma.settings.findUnique({ where: { ownerId: user.ownerId! } });
  const before: Record<string, unknown> = {};
  if (priorSettings) for (const k of Object.keys(body)) if (k in priorSettings) before[k] = (priorSettings as any)[k];
  const settings = await prisma.settings.upsert({ where: { ownerId: user.ownerId! }, update: body as any, create: { ownerId: user.ownerId!, ...body } as any });
  // Only invalidate the tagged skin cache when this save actually belongs
  // to the default owner — getCachedActiveSkinId (root layout) always
  // resolves the default owner's settings (see getDefaultOwnerId's doc
  // comment: the public site has no per-owner routing yet), so another
  // owner's skin edit has no site-wide effect to invalidate.
  if ("activeSeasonalSkinId" in body) {
    const defaultOwnerId = await getDefaultOwnerId();
    if (user.ownerId === defaultOwnerId) revalidateTag("active-skin-id");
  }
  await logAudit(user.id, "settings.update", "Settings", user.ownerId ?? "unknown", { before, after: body });
  return NextResponse.json(settings);
}
