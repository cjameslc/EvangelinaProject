import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canRevealAccessCredential } from "@/lib/rbac";
import { recordCredentialAction } from "@/lib/access/service";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";

// Logs a copy/send action against a credential the caller already revealed
// (via /api/access/credential/reveal) — never returns or re-reveals the
// code itself, just records that it happened. Two ways in: the general
// staff reveal population (canRevealAccessCredential), or — new for
// Housekeeping Workforce Management — a HOUSEKEEPING user copying the one
// code already assigned to their own Employee record (never anyone else's).
export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const credentialId = typeof body.credentialId === "string" ? body.credentialId : null;
  const action = body.action === "copied" || body.action === "sent" ? body.action : null;
  if (!credentialId || !action) return NextResponse.json({ error: "credentialId and a valid action are required." }, { status: 400 });

  if (!canRevealAccessCredential(user.role)) {
    const credential = await prisma.accessCredential.findUnique({
      where: { id: credentialId },
      select: { type: true, assignedEmployeeId: true, unitId: true, unit: { select: { shortName: true } } },
    });
    const employee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true, name: true } });
    const isOwnHousekeepingCode = credential?.type === "HOUSEKEEPING" && employee && credential.assignedEmployeeId === employee.id;
    if (!isOwnHousekeepingCode) return new Response("Forbidden", { status: 403 });

    await recordCredentialAction(credentialId, action, user.id, body.channel ? { channel: body.channel } : undefined);
    if (action === "copied" && credential && employee) {
      await notifyStaff({ type: "code.copied", unitId: credential.unitId, unitName: credential.unit.shortName, employeeName: employee.name });
    }
    return NextResponse.json({ ok: true });
  }

  await recordCredentialAction(credentialId, action, user.id, body.channel ? { channel: body.channel } : undefined);
  return NextResponse.json({ ok: true });
}
