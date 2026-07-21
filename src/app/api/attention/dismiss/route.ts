import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeDashboard(user.role as any)) return new Response("Forbidden", { status: 403 });

  const { key } = await req.json();
  if (typeof key !== "string" || !key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  await prisma.dismissedAttentionItem.upsert({
    where: { key },
    update: {},
    create: { key, dismissedById: user.id },
  });

  return NextResponse.json({ ok: true });
}
