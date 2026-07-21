import { NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/lib/guestSession";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
