import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Just the number the Navbar badge needs — the full /api/chat/conversations
// payload (last-message previews, member lists) would be over-fetching for
// a value polled globally on every page, not just the open Chat page.
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const memberships = await prisma.chatConversationMember.findMany({
    where: { userId: user.id },
    select: { conversationId: true, lastReadAt: true },
  });
  const counts = await Promise.all(
    memberships.map((m) =>
      prisma.chatMessage.count({
        where: {
          conversationId: m.conversationId,
          deletedAt: null,
          senderId: { not: user.id },
          createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
        },
      })
    )
  );
  return NextResponse.json({ count: counts.reduce((s, c) => s + c, 0) });
}
