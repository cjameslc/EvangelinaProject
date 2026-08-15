import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/ownerScope";

export async function GET() {
  const { error } = await requirePlatformAdmin();
  if (error) return error;

  const events = await prisma.deploymentEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json(
    events.map((e) => ({ ...e, affectedModules: e.affectedModules ? (JSON.parse(e.affectedModules) as string[]) : [] }))
  );
}
