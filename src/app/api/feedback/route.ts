import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getFeedbackList, computeFeedbackAnalytics } from "@/lib/bookingEngine/feedbackService";

export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const rows = await getFeedbackList();
  const analytics = computeFeedbackAnalytics(rows);
  return NextResponse.json({ rows, analytics });
}
