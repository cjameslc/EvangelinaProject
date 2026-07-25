import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { requireMembership, markRead } from "@/lib/chat/service";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await requireMembership(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  await markRead(params.id, user.id);
  return NextResponse.json({ ok: true });
}
