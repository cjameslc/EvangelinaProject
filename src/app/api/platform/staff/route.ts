import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/ownerScope";

/**
 * Platform Admin only — every active staff account across every owner, for
 * the "add my employee to another staycation" picker in PlatformView.tsx.
 * This is a real, deliberate cross-owner read (same one-place exception
 * requirePlatformAdmin's doc comment describes) — nowhere else in the app
 * looks across every tenant's staff at once.
 */
export async function GET() {
  const { error } = await requirePlatformAdmin();
  if (error) return error;

  const staff = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true, name: true, username: true, role: true, ownerId: true,
      owner: { select: { businessName: true } },
    },
    orderBy: [{ owner: { businessName: "asc" } }, { name: "asc" }],
  });
  return NextResponse.json(staff);
}
