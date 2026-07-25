import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requireMembership } from "@/lib/chat/service";
import { setTyping, effectivePresence } from "@/lib/chat/presence";

// Polled every few seconds by everyone else in the conversation — cheap
// (one indexed lookup per member row), see usePolling in the chat UI.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await requireMembership(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId: params.id, userId: { not: user.id } },
    select: { user: { select: { id: true, name: true, presence: true } } },
  });
  const typing = members
    .filter((m) => m.user.presence && effectivePresence(m.user.presence, params.id).isTyping)
    .map((m) => ({ id: m.user.id, name: m.user.name }));
  return NextResponse.json(typing);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await requireMembership(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  await setTyping(user.id, body?.typing === false ? null : params.id);
  return NextResponse.json({ ok: true });
}
