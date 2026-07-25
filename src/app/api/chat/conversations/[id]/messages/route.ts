import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { requireMembership, listMessages, sendMessage } from "@/lib/chat/service";
import { touchPresence, setTyping } from "@/lib/chat/presence";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await requireMembership(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  await touchPresence(user.id);
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  const messages = await listMessages(params.id, { before });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await requireMembership(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`chat-send:${user.id}`, 60, 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "You're sending messages too quickly — slow down a bit." }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.body !== "string") return NextResponse.json({ error: "Message body is required." }, { status: 400 });

  try {
    const message = await sendMessage({
      conversationId: params.id,
      senderId: user.id,
      body: body.body,
      replyToId: typeof body.replyToId === "string" ? body.replyToId : null,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
    });
    await setTyping(user.id, null); // sending clears your own typing flag immediately
    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send message." }, { status: 400 });
  }
}
