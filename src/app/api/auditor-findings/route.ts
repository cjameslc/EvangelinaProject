import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { canSeeAuditor } from "@/lib/rbac";
import { auditFindingCreateSchema } from "@/lib/validation";

const INCLUDE = {
  unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
  employee: { select: { id: true, name: true, role: true } },
} as const;

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;

  const findings = await prisma.auditFinding.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: INCLUDE,
  });
  return NextResponse.json(findings);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeAuditor(user.role as any)) return new Response("Forbidden", { status: 403 });

  let body;
  try {
    body = auditFindingCreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }

  const finding = await prisma.auditFinding.create({
    data: {
      auditorName: body.auditorName,
      reviewDate: new Date(body.reviewDate),
      unitId: body.unitId || null,
      employeeId: body.employeeId || null,
      category: body.category as any,
      severity: body.severity as any,
      title: body.title,
      notes: body.notes || null,
      recommendedAction: body.recommendedAction || null,
      cleaningScore: body.cleaningScore ?? null,
      laundryScore: body.laundryScore ?? null,
      bookerScore: body.bookerScore ?? null,
      overallStars: body.overallStars ?? null,
      followUpNeeded: body.followUpNeeded ?? false,
      photoUrl: body.photoUrl || null,
    },
    include: INCLUDE,
  });
  await logAudit(user.id, "finding.create", "AuditFinding", finding.id, { title: finding.title, severity: finding.severity });
  return NextResponse.json(finding, { status: 201 });
}
