import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requireMembership, seenBy } from "@/lib/chat/service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const msg = await prisma.chatMessage.findUnique({ where: { id: params.id }, select: { conversationId: true, createdAt: true } });
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (!(await requireMembership(msg.conversationId, user.id))) return new Response("Forbidden", { status: 403 });

  const users = await seenBy(msg.conversationId, msg.createdAt, user.id);
  return NextResponse.json(users);
}
