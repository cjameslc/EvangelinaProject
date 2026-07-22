import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentGuest } from "@/lib/guestSession";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

  const guest = await getCurrentGuest();
  await prisma.assistantEscalation.create({
    data: {
      guestId: guest?.id ?? null,
      question,
      contactInfo: guest?.email ?? (typeof body.contactInfo === "string" ? body.contactInfo.trim() : null),
    },
  });

  return NextResponse.json({ ok: true });
}
