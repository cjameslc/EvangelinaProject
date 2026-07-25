import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { conversationStats } from "@/lib/chat/audit";

export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  const stats = await conversationStats();
  return NextResponse.json(stats);
}
