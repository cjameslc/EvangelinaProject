import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getBookingCard } from "@/lib/chat/bookingCard";

export async function GET(_req: Request, { params }: { params: { ref: string } }) {
  const { error } = await requireUser();
  if (error) return error;

  const card = await getBookingCard(decodeURIComponent(params.ref).toUpperCase());
  if (!card) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json(card);
}
