import { prisma } from "@/lib/prisma";

export type AnnouncementCategory = "ANNOUNCEMENT" | "URGENT" | "MAINTENANCE" | "POLICY";

/** Active = not yet dismissed by this user — stays pinned indefinitely
 * otherwise, per spec ("remain pinned until dismissed"). No expiry field:
 * an Owner/Admin can always see every announcement ever sent via the
 * conversations list; this just filters what's still surfaced as a banner. */
export async function listActiveAnnouncements(userId: string) {
  return prisma.chatAnnouncement.findMany({
    where: { dismissals: { none: { userId } } },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
}

export async function createAnnouncement(createdById: string, body: string, category: AnnouncementCategory) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Announcement can't be empty.");
  return prisma.chatAnnouncement.create({
    data: { body: trimmed, category, createdById },
    include: { createdBy: { select: { id: true, name: true } } },
  });
}

export async function dismissAnnouncement(announcementId: string, userId: string) {
  await prisma.chatAnnouncementDismissal.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: {},
  });
}
