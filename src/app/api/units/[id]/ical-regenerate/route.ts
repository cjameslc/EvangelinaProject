import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";

// Replaces a unit's export token — the previous URL stops working the
// instant this commits (the old token no longer matches any unit), so this
// is the one case where the token IS regenerated after creation, and only
// on explicit request (the UI requires a confirmation before calling this).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const existing = await prisma.unit.findUnique({ where: { id: params.id }, select: { id: true, icalToken: true } });
  if (!existing) return NextResponse.json({ error: "Unit not found." }, { status: 404 });

  const unit = await prisma.unit.update({
    where: { id: params.id },
    data: { icalToken: crypto.randomBytes(32).toString("hex") },
  });
  await logAudit(user.id, "unit.ical_regenerate", "Unit", unit.id, { previousTokenPrefix: existing.icalToken?.slice(0, 8) });
  return NextResponse.json({ icalToken: unit.icalToken });
}
