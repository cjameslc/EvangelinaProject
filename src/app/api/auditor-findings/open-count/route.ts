import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canSeeAuditor } from "@/lib/rbac";

// Just the count the nav badge needs — same reasoning as
// /api/chat/unread-count: the full findings payload would be over-fetching
// for a value polled globally on every page. Uses the same `resolved: false`
// filter (and its matching @@index([resolved, severity])) as the Auditor
// page and Dashboard's "Needs your attention" rollup, so the badge number
// always agrees with what those pages show.
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeAuditor(user.role)) return NextResponse.json({ count: 0 });

  const count = await prisma.auditFinding.count({ where: { resolved: false } });
  return NextResponse.json({ count });
}
