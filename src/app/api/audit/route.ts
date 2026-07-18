import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN", "AUDITOR"]);
  if (error) return error;
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { actor: { select: { name: true, role: true } } },
  });
  return NextResponse.json(logs);
}
