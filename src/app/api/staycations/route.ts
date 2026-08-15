import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Every staycation (Owner) the current session may switch into — backs the
 * Staycation Switcher dropdown (see src/components/layout/StaycationSwitcher.tsx).
 * A user with just one row here has nothing to switch to; the client hides
 * the dropdown entirely in that case rather than showing a menu with a
 * single, unselectable option.
 */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const access = await prisma.ownerAccess.findMany({
    where: { userId: user.id, owner: { status: "ACTIVE" } },
    select: { role: true, owner: { select: { id: true, businessName: true, logoUrl: true } } },
    orderBy: { owner: { businessName: "asc" } },
  });

  return NextResponse.json(
    access.map((a) => ({
      ownerId: a.owner.id,
      businessName: a.owner.businessName,
      logoUrl: a.owner.logoUrl,
      role: a.role,
      active: a.owner.id === user.ownerId,
    }))
  );
}
