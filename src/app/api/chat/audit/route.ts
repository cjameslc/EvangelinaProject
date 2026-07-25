import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { searchAllMessages } from "@/lib/chat/audit";

// Owner/Admin-only — the one route in this module that deliberately
// bypasses per-conversation membership, per the spec's "Admin Conversation
// Center" (view every private conversation, search everything).
export async function GET(req: NextRequest) {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const messages = await searchAllMessages({
    keyword: sp.get("keyword") ?? undefined,
    userId: sp.get("userId") ?? undefined,
    bookingRef: sp.get("bookingRef") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    includeDeleted: sp.get("includeDeleted") === "true",
  });
  return NextResponse.json(messages);
}
