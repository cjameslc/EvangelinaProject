import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requireMembership, toggleReaction } from "@/lib/chat/service";
import { REACTION_EMOJI } from "@/lib/chat/constants";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const msg = await prisma.chatMessage.findUnique({ where: { id: params.id }, select: { conversationId: true } });
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (!(await requireMembership(msg.conversationId, user.id))) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || !(REACTION_EMOJI as readonly string[]).includes(body.emoji)) return NextResponse.json({ error: "Unsupported reaction." }, { status: 400 });

  const result = await toggleReaction(params.id, user.id, body.emoji);
  return NextResponse.json(result);
}
