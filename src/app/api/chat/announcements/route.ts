import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { listActiveAnnouncements, createAnnouncement, type AnnouncementCategory } from "@/lib/chat/announcements";

const CATEGORIES: AnnouncementCategory[] = ["ANNOUNCEMENT", "URGENT", "MAINTENANCE", "POLICY"];

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  const announcements = await listActiveAnnouncements(user.id);
  return NextResponse.json(announcements);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const category = CATEGORIES.includes(body?.category) ? body.category : "ANNOUNCEMENT";
  if (!body || typeof body.body !== "string") return NextResponse.json({ error: "Announcement text is required." }, { status: 400 });

  try {
    const announcement = await createAnnouncement(user.id, body.body, category);
    return NextResponse.json(announcement, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't post announcement." }, { status: 400 });
  }
}
