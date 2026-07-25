import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { toggleMute } from "@/lib/chat/service";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  try {
    const updated = await toggleMute(params.id, user.id);
    return NextResponse.json({ muted: updated.muted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update." }, { status: 400 });
  }
}
