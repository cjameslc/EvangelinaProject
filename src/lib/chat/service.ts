import { prisma, prismaPool } from "@/lib/prisma";
import { getAvatarIdSet, avatarUrlFor } from "@/lib/chat/avatars";

export type ChatRole = "OWNER_ADMIN" | "CO_OWNER" | "BOOKER" | "HOUSEKEEPING" | "AUDITOR" | string;

/** Real roles this app actually has → the fixed GROUP rooms seeded for
 * them. Not the spec's example department names (Finance/Maintenance/
 * etc.) — this app has no such roles, and inventing rooms nobody can ever
 * populate would be worse than just mapping the ones that exist. */
const GROUP_DEFS: { key: string; name: string; roles: ChatRole[] }[] = [
  { key: "GROUP_BOOKERS", name: "Bookers", roles: ["BOOKER"] },
  { key: "GROUP_HOUSEKEEPING", name: "Housekeeping", roles: ["HOUSEKEEPING"] },
  { key: "GROUP_ADMINS", name: "Admins", roles: ["OWNER_ADMIN", "CO_OWNER", "AUDITOR"] },
];

/** #EVA-XXXXXX (the real confirmation-number format — see
 * bookingEngine/confirmationNumber.ts) found anywhere in a message body,
 * "#" optional, case-insensitive since staff won't always type the exact
 * casing. Returns the canonical uppercase form or null. */
const BOOKING_REF_RE = /#?(EVA-[A-Z0-9]{4,10})/i;
export function extractBookingRef(body: string): string | null {
  const m = body.match(BOOKING_REF_RE);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Idempotent — creates the one TEAM conversation and the role-based GROUP
 * rooms if they don't exist yet, and makes sure every active staff user is
 * a member of TEAM plus whichever GROUP(s) match their role (a promotion/
 * role change picks this up the next time they open chat, no migration
 * step needed). Cheap at this app's real staff count (undefined-created
 * automatically stays under a few dozen rows total), called at the top of
 * the conversations-list route rather than as a one-off script.
 */
// This ran its full check-and-maybe-create logic on every single /chat page
// load — harmless once warm (a handful of read-only queries), but real
// staff/role changes are rare, and the original version did those reads
// sequentially (one conversation at a time, one membership list at a time),
// which measured as several real seconds against Turso before the page
// could even start rendering. A module-level "checked recently" guard skips
// the whole thing on every request but the first per warm serverless
// instance; resets naturally on cold start, so it's never wrong, just
// occasionally redundant.
let lastEnsuredAt = 0;
const ENSURE_RECHECK_MS = 5 * 60 * 1000;

export async function ensureDefaultConversations(): Promise<void> {
  if (Date.now() - lastEnsuredAt < ENSURE_RECHECK_MS) return;

  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, role: true } });
  if (users.length === 0) return;

  const existingConvs = await prisma.chatConversation.findMany({
    where: { OR: [{ type: "TEAM" }, { type: "GROUP", name: { in: GROUP_DEFS.map((d) => d.name) } }] },
    select: { id: true, type: true, name: true },
  });

  let team = existingConvs.find((c) => c.type === "TEAM");
  const missingConvCreates: Promise<unknown>[] = [];
  if (!team) {
    missingConvCreates.push(
      prisma.chatConversation.create({ data: { type: "TEAM", name: "Team Chat" }, select: { id: true } }).then((c) => { team = { ...c, type: "TEAM", name: "Team Chat" }; })
    );
  }
  const groupByName = new Map(GROUP_DEFS.map((d) => [d.name, existingConvs.find((c) => c.type === "GROUP" && c.name === d.name)] as const));
  for (const def of GROUP_DEFS) {
    if (!groupByName.get(def.name)) {
      missingConvCreates.push(
        prisma.chatConversation.create({ data: { type: "GROUP", name: def.name }, select: { id: true } }).then((c) => groupByName.set(def.name, { ...c, type: "GROUP", name: def.name }))
      );
    }
  }
  if (missingConvCreates.length > 0) await Promise.all(missingConvCreates);

  const allConvIds = [team!.id, ...GROUP_DEFS.map((d) => groupByName.get(d.name)!.id)];
  const existingMembers = await prisma.chatConversationMember.findMany({
    where: { conversationId: { in: allConvIds } },
    select: { conversationId: true, userId: true },
  });
  const memberSet = new Set(existingMembers.map((m) => `${m.conversationId}::${m.userId}`));

  const toCreate: { conversationId: string; userId: string }[] = [];
  for (const u of users) {
    if (!memberSet.has(`${team!.id}::${u.id}`)) toCreate.push({ conversationId: team!.id, userId: u.id });
    for (const def of GROUP_DEFS) {
      if (!def.roles.includes(u.role)) continue;
      const groupId = groupByName.get(def.name)!.id;
      if (!memberSet.has(`${groupId}::${u.id}`)) toCreate.push({ conversationId: groupId, userId: u.id });
    }
  }
  if (toCreate.length > 0) {
    try {
      await prisma.chatConversationMember.createMany({ data: toCreate });
    } catch (e: any) {
      // The check-then-insert above isn't atomic, and the lastEnsuredAt
      // guard is per-instance (a fresh cold-started serverless instance
      // starts at 0) — under real concurrency two requests can both decide
      // the same rows are missing and both try to insert them. SQLite/Turso
      // doesn't support skipDuplicates on createMany, so a UNIQUE constraint
      // hit here just means another concurrent request already finished the
      // exact same provisioning — not a real failure, everyone ends up a
      // member either way. Anything else is a genuine error.
      if (!String(e?.message ?? "").includes("Unique constraint")) throw e;
    }
  }

  lastEnsuredAt = Date.now();
}

// avatarUrl is a raw base64 data-URL in this app (the same "tens to
// hundreds of KB per photo" field that's caused real page-bloat incidents
// elsewhere — Unit.photoUrl, Booking.proofUrl). Never selected directly in
// any bulk/list-shaped chat query below (conversation member lists,
// presence, every message's sender) — confirmed the hard way: including it
// for a 14-member Team Chat blew one page response out to 12.9MB and a 4s+
// load. Real avatars still show — see avatars.ts/avatarUrlFor: every user
// object below gets `avatarUrl` set to a lazily-loaded /api/chat/avatar
// URL (or null) instead of the actual bytes.
const MEMBER_SELECT = {
  members: { include: { user: { select: { id: true, name: true, role: true, avatarColor: true } } } },
};

export async function listConversationsForUser(userId: string) {
  const [memberships, avatarIds] = await Promise.all([
    prisma.chatConversationMember.findMany({
      where: { userId },
      include: { conversation: { include: MEMBER_SELECT } },
    }),
    getAvatarIdSet(),
  ]);

  // Who's typing right now, in any conversation this user is a member of —
  // one batched query instead of one per conversation, so the sidebar can
  // show a live "Alice is typing…" preview without an N+1.
  const convIds = memberships.map((m) => m.conversationId);
  const typingRows = convIds.length
    ? await prisma.userPresence.findMany({
        where: { typingInConversationId: { in: convIds }, typingAt: { gt: new Date(Date.now() - 8000) }, userId: { not: userId } },
        select: { userId: true, typingInConversationId: true },
      })
    : [];
  const typingUserIdsByConv = new Map<string, string[]>();
  for (const t of typingRows) {
    const arr = typingUserIdsByConv.get(t.typingInConversationId!) ?? [];
    arr.push(t.userId);
    typingUserIdsByConv.set(t.typingInConversationId!, arr);
  }

  // One client per conversation, round-robin across the read pool — libSQL
  // serializes queries on a single client behind a mutex, so running every
  // conversation's pair of reads on the same shared `prisma` client got no
  // real concurrency despite already being batched via Promise.all (see
  // src/lib/prisma.ts). This runs on every Bookings/Chat page load, once
  // per conversation the viewer is a member of.
  const results = await Promise.all(
    memberships.map(async (m, i) => {
      const conv = m.conversation;
      const client = prismaPool[i % prismaPool.length];
      const [lastMessage, unreadCount] = await Promise.all([
        client.chatMessage.findFirst({
          where: { conversationId: conv.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, createdAt: true, senderId: true, sender: { select: { name: true } } },
        }),
        client.chatMessage.count({
          where: {
            conversationId: conv.id,
            deletedAt: null,
            senderId: { not: userId },
            createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
          },
        }),
      ]);
      const members = conv.members.map((mm) => ({ ...mm.user, avatarUrl: avatarUrlFor(mm.user.id, avatarIds) }));
      const otherMembers = members.filter((u) => u.id !== userId);
      const displayName = conv.type === "DM" ? (otherMembers[0]?.name ?? "Direct message") : conv.name;
      const typingUserNames = (typingUserIdsByConv.get(conv.id) ?? [])
        .map((uid) => members.find((mm) => mm.id === uid)?.name)
        .filter((n): n is string => !!n);
      return {
        id: conv.id,
        type: conv.type,
        name: displayName,
        memberCount: conv.members.length,
        members,
        favorited: m.favorited,
        muted: m.muted,
        lastMessage: lastMessage
          ? { id: lastMessage.id, body: lastMessage.body, createdAt: lastMessage.createdAt.toISOString(), senderId: lastMessage.senderId, senderName: lastMessage.sender.name }
          : null,
        unreadCount,
        typingUserNames,
      };
    })
  );

  // TEAM first, then GROUP, then DMs — most-recent-activity within each
  // group, matching how a chat app's sidebar is normally scanned (fixed
  // company-wide rooms anchored at top, the freeform DM list below it).
  const order: Record<string, number> = { TEAM: 0, GROUP: 1, DM: 2 };
  results.sort((a, b) => {
    if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });
  return results;
}

/** Membership check every conversation-scoped route needs — a DM/GROUP's
 * messages are only ever visible to its actual members (Admin's separate
 * audit route is the one deliberate bypass of this, see chat/audit.ts). */
export async function requireMembership(conversationId: string, userId: string): Promise<boolean> {
  const m = await prisma.chatConversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  return !!m;
}

export async function getOrCreateDM(userId: string, otherUserId: string): Promise<string> {
  if (userId === otherUserId) throw new Error("Cannot start a DM with yourself.");
  // A DM is uniquely identified by its exact 2-member set — find any
  // existing DM conversation both users belong to rather than trusting a
  // derived key, since membership rows are the actual source of truth.
  const mine = await prisma.chatConversationMember.findMany({ where: { userId, conversation: { type: "DM" } }, select: { conversationId: true } });
  if (mine.length > 0) {
    const shared = await prisma.chatConversationMember.findFirst({
      where: { userId: otherUserId, conversationId: { in: mine.map((m) => m.conversationId) } },
      select: { conversationId: true },
    });
    if (shared) return shared.conversationId;
  }
  const conv = await prisma.chatConversation.create({
    data: { type: "DM", members: { create: [{ userId }, { userId: otherUserId }] } },
    select: { id: true },
  });
  return conv.id;
}

export async function listMessages(conversationId: string, opts: { before?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 40, 100);
  const [rows, avatarIds] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { conversationId, ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        sender: { select: { id: true, name: true, role: true, avatarColor: true } },
        reactions: { include: { user: { select: { id: true, name: true } } } },
        replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } },
      },
    }),
    getAvatarIdSet(),
  ]);
  const withAvatars = rows.map((r) => ({ ...r, sender: { ...r.sender, avatarUrl: avatarUrlFor(r.sender.id, avatarIds) } }));
  return withAvatars.reverse();
}

export async function sendMessage(params: { conversationId: string; senderId: string; body: string; replyToId?: string | null; imageUrl?: string | null }) {
  const body = params.body.trim();
  if (!body && !params.imageUrl) throw new Error("Message can't be empty.");
  if (body.length > 4000) throw new Error("Message is too long.");
  const bookingRef = extractBookingRef(body);
  const [msg, avatarIds] = await Promise.all([
    prisma.chatMessage.create({
      data: {
        conversationId: params.conversationId,
        senderId: params.senderId,
        body,
        bookingRef,
        replyToId: params.replyToId ?? null,
        imageUrl: params.imageUrl ?? null,
      },
      include: {
        sender: { select: { id: true, name: true, role: true, avatarColor: true } },
        reactions: true,
        replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } },
      },
    }),
    getAvatarIdSet(),
  ]);
  // Sending clears your own unread count for this conversation too — you
  // just read everything up to and including what you sent.
  await prisma.chatConversationMember.updateMany({
    where: { conversationId: params.conversationId, userId: params.senderId },
    data: { lastReadAt: msg.createdAt },
  });
  return { ...msg, sender: { ...msg.sender, avatarUrl: avatarUrlFor(msg.sender.id, avatarIds) } };
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export async function editMessage(messageId: string, userId: string, body: string) {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.deletedAt) throw new Error("Message not found.");
  if (msg.senderId !== userId) throw new Error("You can only edit your own messages.");
  if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) throw new Error("This message can no longer be edited (15-minute window).");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message can't be empty.");
  return prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: trimmed, bookingRef: extractBookingRef(trimmed), editedAt: new Date() },
  });
}

/** Soft delete — the row (and its reactions/replies referencing it) stays,
 * matching the "no message should ever be permanently lost" audit
 * requirement. isAdmin lets an Owner/Admin remove anyone's message. */
export async function deleteMessage(messageId: string, userId: string, isAdmin: boolean) {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { senderId: true, deletedAt: true } });
  if (!msg || msg.deletedAt) throw new Error("Message not found.");
  if (msg.senderId !== userId && !isAdmin) throw new Error("You can only delete your own messages.");
  await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const existing = await prisma.chatReaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId, emoji } } });
  if (existing) {
    await prisma.chatReaction.delete({ where: { id: existing.id } });
    return { added: false };
  }
  await prisma.chatReaction.create({ data: { messageId, userId, emoji } });
  return { added: true };
}

export async function togglePin(messageId: string) {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { pinned: true } });
  if (!msg) throw new Error("Message not found.");
  return prisma.chatMessage.update({ where: { id: messageId }, data: { pinned: !msg.pinned } });
}

export async function listPinned(conversationId: string) {
  return prisma.chatMessage.findMany({
    where: { conversationId, pinned: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, name: true } } },
  });
}

export async function markRead(conversationId: string, userId: string) {
  await prisma.chatConversationMember.updateMany({ where: { conversationId, userId }, data: { lastReadAt: new Date() } });
}

export async function toggleFavorite(conversationId: string, userId: string) {
  const member = await prisma.chatConversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!member) throw new Error("Not a member of this conversation.");
  return prisma.chatConversationMember.update({ where: { id: member.id }, data: { favorited: !member.favorited } });
}

/** Muting stops sound/toast notifications for a conversation (see
 * ChatView's shouldNotify check) without hiding it or its unread badge —
 * same "still there, just quiet" semantics as muting a thread anywhere
 * else. */
export async function toggleMute(conversationId: string, userId: string) {
  const member = await prisma.chatConversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!member) throw new Error("Not a member of this conversation.");
  return prisma.chatConversationMember.update({ where: { id: member.id }, data: { muted: !member.muted } });
}

/** "Seen by" for a message — every OTHER member whose lastReadAt is at or
 * after this message's createdAt. Cheap (one query per open message
 * detail, not per message in the list) since it's only computed on
 * request, not embedded in the main message feed. */
export async function seenBy(conversationId: string, messageCreatedAt: Date, excludeUserId: string) {
  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId, userId: { not: excludeUserId }, lastReadAt: { gte: messageCreatedAt } },
    include: { user: { select: { id: true, name: true } } },
  });
  return members.map((m) => m.user);
}
