import { prisma } from "@/lib/prisma";

/** A ping older than this reads as Offline no matter what status was last
 * stored — closing a laptop without explicitly signing out must not leave
 * someone shown as "Online" forever. */
const STALE_MS = 5 * 60 * 1000;
/** Between STALE_MS and this, a manual (non-heartbeat) status still holds;
 * a plain auto "Online" instead fades to "Away". */
const AWAY_MS = 2 * 60 * 1000;

export type PresenceStatus = "ONLINE" | "BUSY" | "AWAY" | "DND" | "MEETING" | "OFFLINE";

export type EffectivePresence = {
  status: PresenceStatus;
  statusNote: string | null;
  device: string | null;
  lastActiveAt: string;
  isTyping: boolean;
};

/** The stored row is the last thing the user (or their heartbeat) told us —
 * this derives what should actually be displayed right now, since a
 * heartbeat that stopped arriving is itself information ("gone offline")
 * that the stored `status` field alone can't express. Manual statuses
 * (Busy/DND/Meeting/Away) hold for the full STALE_MS window on the theory
 * that someone stepping into a meeting isn't still pinging every few
 * seconds anyway; only Offline is decided purely by recency. */
export function effectivePresence(row: {
  status: string;
  statusNote: string | null;
  device: string | null;
  lastActiveAt: Date;
  typingInConversationId: string | null;
  typingAt: Date | null;
}, conversationId?: string): EffectivePresence {
  const now = Date.now();
  const sinceActive = now - row.lastActiveAt.getTime();
  const isManual = row.status === "BUSY" || row.status === "DND" || row.status === "MEETING";

  let status: PresenceStatus;
  if (sinceActive > STALE_MS) status = "OFFLINE";
  else if (isManual) status = row.status as PresenceStatus;
  else if (sinceActive > AWAY_MS) status = "AWAY";
  else status = "ONLINE";

  const isTyping = !!(
    conversationId &&
    row.typingInConversationId === conversationId &&
    row.typingAt &&
    now - row.typingAt.getTime() < 8000
  );

  return { status, statusNote: row.statusNote, device: row.device, lastActiveAt: row.lastActiveAt.toISOString(), isTyping };
}

/** Called on every chat API hit (not just an explicit "heartbeat" call) so
 * presence stays accurate just from someone actively using the app —
 * cheap upsert, no read-then-write race since Prisma does this atomically. */
export async function touchPresence(userId: string, opts?: { status?: PresenceStatus; statusNote?: string | null; device?: string | null }) {
  const data: Record<string, unknown> = { lastActiveAt: new Date() };
  if (opts?.status) data.status = opts.status;
  if (opts?.statusNote !== undefined) data.statusNote = opts.statusNote;
  if (opts?.device !== undefined) data.device = opts.device;
  await prisma.userPresence.upsert({
    where: { userId },
    create: { userId, status: opts?.status ?? "ONLINE", statusNote: opts?.statusNote ?? null, device: opts?.device ?? null },
    update: data,
  });
}

export async function setTyping(userId: string, conversationId: string | null) {
  await prisma.userPresence.upsert({
    where: { userId },
    create: { userId, status: "ONLINE", typingInConversationId: conversationId, typingAt: conversationId ? new Date() : null },
    update: { typingInConversationId: conversationId, typingAt: conversationId ? new Date() : null, lastActiveAt: new Date() },
  });
}
