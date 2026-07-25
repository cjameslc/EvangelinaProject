import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Serves a staff member's real profile picture for chat — without this,
 * showing real avatars in chat meant embedding `avatarUrl` (a base64
 * data-URL, tens to hundreds of KB) directly in every bulk chat response
 * (conversation member lists, presence, every message's sender), which
 * blew a single /chat page load out to 12.9MB (see the chat-service
 * comment on MEMBER_SELECT). Same fix as the Google Places/Unsplash photo
 * proxies elsewhere in this app: keep the bulk JSON small (just a
 * hasAvatar boolean + this URL), let the browser fetch and cache the
 * actual image bytes as a normal, lazily-loaded <img> request.
 */
export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const { error } = await requireUser();
  if (error) return error;

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { avatarUrl: true } });
  if (!user?.avatarUrl) return new NextResponse("Not found", { status: 404 });

  const match = user.avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return new NextResponse("Not found", { status: 404 });
  const [, contentType, base64] = match;

  return new NextResponse(Buffer.from(base64, "base64"), {
    headers: {
      "Content-Type": contentType,
      // A given user's current avatar is stable until they change it —
      // short-ish max-age (unlike the Places photo proxy's 24h) since a
      // profile photo update should show up for teammates reasonably soon.
      "Cache-Control": "private, max-age=600",
    },
  });
}
