import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EarningsView } from "@/components/earnings/EarningsView";
import { getCategoryImagesBatch } from "@/lib/unsplash/service";

const JOURNEY_IMAGE_KEYS = ["journey-village", "journey-forest", "journey-castle", "journey-peak", "journey-volcano", "journey-sky", "journey-kingdom"];
const TEAM_IMAGE_KEYS = ["team-booking", "team-housekeeping", "team-operations"];
const UNIT_IMAGE_KEYS = ["gallery-bedroom", "gallery-living-area", "room-info"];

export default async function EarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdminViewer = user.role === "OWNER_ADMIN" || user.role === "CO_OWNER";
  const ownEmployee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true, name: true, role: true } });

  // Owners/Co-owners never have payroll of their own — they get the
  // admin/analytics view (leaderboard + pick-an-employee). Anyone else
  // without a linked, payroll-eligible Staff record has nothing to show.
  if (!isAdminViewer && (!ownEmployee || !["BOOKER", "HOUSEKEEPING", "AUDITOR"].includes(ownEmployee.role))) {
    redirect("/");
  }

  const employees = isAdminViewer
    ? await prisma.employee.findMany({ where: { active: true, role: { in: ["BOOKER", "HOUSEKEEPING", "AUDITOR"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } })
    : [];

  // Gamification module visuals — pure cache reads (never a live Unsplash
  // call on the request path, see getCategoryImagesBatch), so this never
  // slows the page down or risks the API's rate limit. An unwarmed/errored
  // category just comes back an empty array and each component's own
  // gradient fallback renders instead.
  const [journeyImages, teamImages, unitImages] = await Promise.all([
    getCategoryImagesBatch(JOURNEY_IMAGE_KEYS),
    getCategoryImagesBatch(TEAM_IMAGE_KEYS),
    getCategoryImagesBatch(UNIT_IMAGE_KEYS),
  ]);

  return (
    <EarningsView
      role={user.role}
      isAdminViewer={isAdminViewer}
      // An admin/co-owner may themselves have a linked Staff record (e.g.
      // the seed's original admin account), but it's never payroll-eligible
      // for them — default to the employee picker's list instead, not their
      // own non-payroll record.
      ownEmployeeId={isAdminViewer ? null : ownEmployee?.id ?? null}
      employees={employees}
      journeyImages={journeyImages}
      teamImages={teamImages}
      unitImages={unitImages}
    />
  );
}
