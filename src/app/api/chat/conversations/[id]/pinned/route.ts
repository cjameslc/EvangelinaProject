import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { requireMembership, listPinned } from "@/lib/chat/service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!(await requireMembership(params.id, user.id))) return new Response("Forbidden", { status: 403 });

  const pinned = await listPinned(params.id);
  return NextResponse.json(pinned);
}
