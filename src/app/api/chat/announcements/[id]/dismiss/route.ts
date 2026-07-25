import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { dismissAnnouncement } from "@/lib/chat/announcements";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  await dismissAnnouncement(params.id, user.id);
  return NextResponse.json({ ok: true });
}
