import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { touchPresence, effectivePresence, type PresenceStatus } from "@/lib/chat/presence";

const MANUAL_STATUSES: PresenceStatus[] = ["BUSY", "AWAY", "DND", "MEETING"];

// Every active staff member's live presence — the "Team Members" sidebar
// and the Team Activity Dashboard's online/busy/away counts both read from
// this one list rather than each running their own query.
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  await touchPresence(user.id);
  // avatarUrl deliberately excluded — see the comment on chat/service.ts's
  // MEMBER_SELECT (raw base64 data-URL, blows up a bulk/every-staff-member
  // response). Presence avatars are initials-only.
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, avatarColor: true, presence: true },
    orderBy: { name: "asc" },
  });
  const result = users.map((u) => {
    const presence = u.presence
      ? effectivePresence(u.presence)
      : { status: "OFFLINE" as const, statusNote: null, device: null, lastActiveAt: new Date(0).toISOString(), isTyping: false };
    return { id: u.id, name: u.name, role: u.role, avatarUrl: null as string | null, avatarColor: u.avatarColor, ...presence };
  });
  return NextResponse.json(result);
}

// Heartbeat ping (called every ~30s while the app is open) — optionally
// carries a manual status the user picked (Busy/Away/DND/In a meeting)
// with a custom note, or clears back to automatic by passing status:null.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const status: PresenceStatus | undefined = MANUAL_STATUSES.includes(body?.status) ? body.status : body?.status === null ? undefined : undefined;
  const clearingManual = body?.status === null;

  await touchPresence(user.id, {
    status: clearingManual ? "ONLINE" : status,
    statusNote: typeof body?.statusNote === "string" ? body.statusNote.slice(0, 80) : clearingManual ? null : undefined,
    device: body?.device === "mobile" ? "mobile" : body?.device === "desktop" ? "desktop" : undefined,
  });
  return NextResponse.json({ ok: true });
}
