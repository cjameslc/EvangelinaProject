import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canRevokeAccessCredential } from "@/lib/rbac";
import { revokeCredential } from "@/lib/access/service";

export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canRevokeAccessCredential(user.role)) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const credentialId = typeof body.credentialId === "string" ? body.credentialId : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!credentialId) return NextResponse.json({ error: "credentialId is required." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "A reason is required to revoke access." }, { status: 400 });

  const credential = await prisma.accessCredential.findUnique({ where: { id: credentialId }, select: { unitId: true } });
  if (!credential || !await isUnitInScope(user, credential.unitId)) return NextResponse.json({ error: "Credential not found." }, { status: 404 });

  try {
    await revokeCredential(credentialId, user.id, reason);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to revoke." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
