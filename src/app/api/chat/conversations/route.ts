import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { ensureDefaultConversations, listConversationsForUser, getOrCreateDM } from "@/lib/chat/service";
import { touchPresence } from "@/lib/chat/presence";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  await ensureDefaultConversations();
  await touchPresence(user.id);
  const conversations = await listConversationsForUser(user.id);
  return NextResponse.json(conversations);
}

// Start (or resume) a DM — the body carries the other user's id.
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const otherUserId = body?.userId;
  if (typeof otherUserId !== "string" || !otherUserId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  try {
    const conversationId = await getOrCreateDM(user.id, otherUserId);
    return NextResponse.json({ conversationId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't start conversation." }, { status: 400 });
  }
}
