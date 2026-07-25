import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { requireMembership, editMessage, deleteMessage } from "@/lib/chat/service";

async function checkAccess(messageId: string, userId: string): Promise<boolean> {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { conversationId: true } });
  if (!msg) return false;
  return requireMembership(msg.conversationId, userId);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await checkAccess(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.body !== "string") return NextResponse.json({ error: "Message body is required." }, { status: 400 });

  try {
    const updated = await editMessage(params.id, user.id, body.body);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't edit message." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await checkAccess(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  try {
    await deleteMessage(params.id, user.id, user.role === "OWNER_ADMIN");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete message." }, { status: 400 });
  }
}
