import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { ownerProfileSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";

/**
 * An Owner/Co-owner's own tenant identity — businessName + logoUrl on their
 * own `Owner` row, editable from Admin -> Settings -> Staycation Profile.
 * Deliberately separate from Settings.businessName/logoUrl (that's a
 * global singleton shared by every tenant on this platform — see the
 * schema's own doc comment — so writing here can never clobber another
 * owner's, or Evangelina's, live Settings row).
 */
export async function GET() {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!user.ownerId) return NextResponse.json({ error: "No tenant linked to this account." }, { status: 404 });

  const owner = await prisma.owner.findUnique({ where: { id: user.ownerId }, select: { businessName: true, logoUrl: true } });
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(owner);
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!user.ownerId) return NextResponse.json({ error: "No tenant linked to this account." }, { status: 404 });

  const parsed = parseOrError(ownerProfileSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  const owner = await prisma.owner.update({
    where: { id: user.ownerId },
    data: { businessName: parsed.data.businessName, logoUrl: parsed.data.logoUrl ?? null },
    select: { businessName: true, logoUrl: true },
  });
  await logAudit(user.id, "owner.profile.update", "Owner", user.ownerId, owner);
  return NextResponse.json(owner);
}
