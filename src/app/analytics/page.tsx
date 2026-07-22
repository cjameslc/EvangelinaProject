import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAnalytics } from "@/lib/rbac";

// Placeholder shell for Phase A — proves the route, RBAC gate, and nav
// entry work end-to-end before any real analytics sections are built
// (Phase B onward). Same auth pattern as /dashboard/page.tsx.
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAnalytics(user.role)) redirect("/");

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
      <p className="mt-2 text-sm text-[var(--gray)]">
        The full Metrics &amp; Analytics module is being built in phases — Executive KPIs, Revenue, Financial,
        Booking, Occupancy, Guest, Housekeeping, Staff, and Unit Performance sections are coming next.
      </p>
    </div>
  );
}
