import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { canSeeAuditor } from "@/lib/rbac";
import { auditFindingUpdateSchema } from "@/lib/validation";

const INCLUDE = {
  unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
  employee: { select: { id: true, name: true, role: true } },
} as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeAuditor(user.role as any)) return new Response("Forbidden", { status: 403 });

  // Was missing — same audit sweep as Units/Users/Employees.
  const existing = await prisma.auditFinding.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!existing || existing.ownerId !== user.ownerId) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

  let body;
  try {
    body = auditFindingUpdateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...body };
  if (body.reviewDate) data.reviewDate = new Date(body.reviewDate);
  if (body.resolved !== undefined) data.resolvedAt = body.resolved ? new Date() : null;

  const finding = await prisma.auditFinding.update({ where: { id: params.id }, data, include: INCLUDE });

  if (body.resolved !== undefined) {
    await logAudit(user.id, body.resolved ? "finding.resolve" : "finding.reopen", "AuditFinding", finding.id);
  }
  return NextResponse.json(finding);
}
