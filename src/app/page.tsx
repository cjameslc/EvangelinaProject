import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";
import { getViewMode } from "@/lib/viewMode";
import { getCachedGuidebookCore } from "@/lib/guidebookService";
import { GuideHubView } from "@/components/guest/GuideHubView";

export default async function Home() {
  const user = await getCurrentUser();
  // Staff redirect logic — unchanged, UNLESS this employee has switched to
  // Travel Mode (Navbar's mode toggle), in which case they fall through to
  // the same guest homepage below instead of being bounced to their staff
  // page. Their staff session/access is untouched either way — this only
  // changes what "/" renders for them, not what they're allowed to reach.
  if (user && getViewMode() === "staff") {
    if (canSeeDashboard(user.role)) redirect("/dashboard");
    if (user.role === "AUDITOR") redirect("/auditor");
    redirect("/bookings");
  }

  // No staff session (or a staff session in Travel Mode) — render the
  // Guest Experience tile hub, the app's default landing page per the
  // Guest Experience Module spec. Completely independent of Booking (see
  // /book and BookFlowView) — this page links out to booking, it never
  // renders booking content itself. (middleware.ts's authorized callback
  // special-cases "/" to make this reachable unauthenticated.)
  const { hostName } = await getCachedGuidebookCore();

  return <GuideHubView hostName={hostName} />;
}
