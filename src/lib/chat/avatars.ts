import { prisma } from "@/lib/prisma";

/**
 * Which users currently have a real profile photo — just the id set, never
 * the actual base64 bytes (see /api/chat/avatar/[userId] for where those
 * are actually served, lazily, one browser <img> request at a time). This
 * is what lets chat show real avatars without reintroducing the payload-
 * bloat bug: a bulk response only ever carries a cheap boolean-shaped URL
 * pointer per user, not repeated copies of their actual photo.
 *
 * Short in-memory cache — avatar changes are rare, and this otherwise runs
 * on every poll tick across every open chat page.
 */
let cache: { ids: Set<string>; fetchedAt: number } | null = null;
const CACHE_MS = 60_000;

export async function getAvatarIdSet(): Promise<Set<string>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.ids;
  const rows = await prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { id: true } });
  cache = { ids: new Set(rows.map((r) => r.id)), fetchedAt: Date.now() };
  return cache.ids;
}

export function avatarUrlFor(userId: string, ids: Set<string>): string | null {
  return ids.has(userId) ? `/api/chat/avatar/${userId}` : null;
}
