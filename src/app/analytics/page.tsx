import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeAnalytics } from "@/lib/rbac";
import { dashboardUnitIdWhere } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { KpiRow } from "@/components/analytics/KpiRow";
import { RevenueSection } from "@/components/analytics/sections/RevenueSection";
import { FinancialSection } from "@/components/analytics/sections/FinancialSection";
import { getExecutiveKPIs, type AnalyticsFilters } from "@/app/analytics/queries";
import type { AnalyticsPeriodPreset } from "@/lib/analytics/period";

async function ExecutiveKpiSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const kpis = await getExecutiveKPIs(user, filters);
  return <KpiRow kpis={kpis} />;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAnalytics(user.role)) redirect("/");

  const availableUnits = await prisma.unit.findMany({
    where: dashboardUnitIdWhere(user),
    orderBy: { sortOrder: "asc" },
    select: { id: true, shortName: true },
  });

  const filters: AnalyticsFilters = {
    preset: (searchParams.period as AnalyticsPeriodPreset) || "month",
    customStart: searchParams.start,
    customEnd: searchParams.end,
    unitIds: searchParams.units ? searchParams.units.split(",").filter(Boolean) : null,
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-[var(--gray)]">Executive KPIs, Revenue, and Financial for your portfolio — Booking, Occupancy, Guest, Housekeeping, and Staff sections are coming in later phases.</p>

      <div className="mt-5">
        <AnalyticsFilterBar units={availableUnits} />
      </div>

      <Suspense fallback={<KpiRowSkeleton />} key={`kpi-${JSON.stringify(filters)}`}>
        <ExecutiveKpiSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds }} filters={filters} />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`revenue-${JSON.stringify(filters)}`}>
          <RevenueSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`financial-${JSON.stringify(filters)}`}>
          <FinancialSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds }} filters={filters} />
        </Suspense>
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return <div className="card h-[220px] animate-pulse p-4" />;
}

function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="stat-card animate-pulse">
          <div className="h-3 w-16 rounded bg-[var(--bg-2)]" />
          <div className="mt-3 h-6 w-20 rounded bg-[var(--bg-2)]" />
        </div>
      ))}
    </div>
  );
}
