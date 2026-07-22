import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { settingsSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  const parsed = parseOrError(settingsSchema.partial(), await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: body as any, create: { id: 1, ...body } as any });
  await logAudit(user.id, "settings.update", "Settings", "1", body);
  return NextResponse.json(settings);
}
