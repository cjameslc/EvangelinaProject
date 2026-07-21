import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendGuestLoginEmail } from "@/lib/email";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.guestLoginToken.create({ data: { email, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) } });

  const link = `${req.nextUrl.origin}/api/guest/auth/verify?token=${token}`;
  try {
    await sendGuestLoginEmail(email, link);
  } catch (e) {
    console.error("Failed to send guest login email", e);
  }

  // Same response regardless of send outcome — this endpoint must never be
  // usable to enumerate which emails have an account or to probe send failures.
  return NextResponse.json({ ok: true });
}
