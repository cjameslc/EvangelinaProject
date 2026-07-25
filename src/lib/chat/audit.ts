import { prisma } from "@/lib/prisma";

/**
 * Owner/Admin-only search across EVERY conversation, including private
 * DMs — the one deliberate bypass of requireMembership(). Every route that
 * calls this must itself be gated to OWNER_ADMIN (see /api/chat/audit) so
 * this module never has to re-check authorization internally; it trusts
 * its caller the same way the rest of this app's service-layer functions
 * trust theirs.
 */
export async function searchAllMessages(filters: {
  keyword?: string;
  userId?: string;
  bookingRef?: string;
  from?: string;
  to?: string;
  includeDeleted?: boolean;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (!filters.includeDeleted) where.deletedAt = null;
  if (filters.userId) where.senderId = filters.userId;
  if (filters.bookingRef) where.bookingRef = filters.bookingRef.toUpperCase();
  if (filters.keyword) where.body = { contains: filters.keyword };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  return prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 100, 300),
    include: {
      sender: { select: { id: true, name: true, role: true } },
      conversation: { select: { id: true, type: true, name: true } },
    },
  });
}

export async function conversationStats() {
  const [totalMessages, totalConversations, byType, messagesToday] = await Promise.all([
    prisma.chatMessage.count({ where: { deletedAt: null } }),
    prisma.chatConversation.count(),
    prisma.chatConversation.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.chatMessage.count({ where: { deletedAt: null, createdAt: { gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") } } }),
  ]);
  const mostActive = await prisma.chatMessage.groupBy({
    by: ["senderId"],
    where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    _count: { _all: true },
    orderBy: { _count: { senderId: "desc" } },
    take: 5,
  });
  const senders = await prisma.user.findMany({ where: { id: { in: mostActive.map((m) => m.senderId) } }, select: { id: true, name: true } });
  const nameById = new Map(senders.map((s) => [s.id, s.name]));
  return {
    totalMessages,
    totalConversations,
    messagesToday,
    byType: Object.fromEntries(byType.map((b) => [b.type, b._count._all])),
    mostActive: mostActive.map((m) => ({ userId: m.senderId, name: nameById.get(m.senderId) ?? "Unknown", messageCount: m._count._all })),
  };
}
