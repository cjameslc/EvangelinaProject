import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { effectivePageAccess } from "@/lib/pageAccess";
import { dashboardUnitIdWhere } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { manilaTimeGreeting } from "@/lib/manilaTime";
import { SeasonalBadge } from "@/components/skins/SeasonalBadge";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";
import { KpiRow } from "@/components/analytics/KpiRow";
import { MetricsHero } from "@/components/analytics/MetricsHero";
import { MetricKpiCard } from "@/components/analytics/MetricKpiCard";
import { HowAreWeDoing } from "@/components/analytics/HowAreWeDoing";
import { RevenueSection } from "@/components/analytics/sections/RevenueSection";
import { FinancialSection } from "@/components/analytics/sections/FinancialSection";
import { BookingSection } from "@/components/analytics/sections/BookingSection";
import { OccupancySection } from "@/components/analytics/sections/OccupancySection";
import { GuestSection } from "@/components/analytics/sections/GuestSection";
import { HousekeepingSection } from "@/components/analytics/sections/HousekeepingSection";
import { StaffSection } from "@/components/analytics/sections/StaffSection";
import { CommissionSection } from "@/components/analytics/sections/CommissionSection";
import { UnitPerformanceSection } from "@/components/analytics/sections/UnitPerformanceSection";
import { ExportMenu } from "@/components/analytics/ExportMenu";
import { AutoRefresh } from "@/components/analytics/AutoRefresh";
import { AIInsightsPanel } from "@/components/analytics/AIInsightsPanel";
import { RevenueGoalsSection } from "@/components/analytics/sections/RevenueGoalsSection";
import { ForecastSection } from "@/components/analytics/sections/ForecastSection";
import { getExecutiveKPIs, type AnalyticsFilters } from "@/app/analytics/queries";
import { peso, pesoCentavos } from "@/lib/format";
import type { AnalyticsPeriodPreset } from "@/lib/analytics/period";

const PERIOD_LABEL: Record<AnalyticsPeriodPreset, string> = {
  today: "Today's", yesterday: "Yesterday's", week: "This Week's", month: "This Month's",
  quarter: "This Quarter's", year: "This Year's", custom: "Selected Period's",
};

async function ExecutiveKpiSection({ user, filters }: { user: { role: string; ownedUnitIds: string[]; ownerId: string | null }; filters: AnalyticsFilters }) {
  const kpis = await getExecutiveKPIs(user, filters);
  return (
    <div className="space-y-4">
      <MetricsHero kpis={kpis} periodLabel={PERIOD_LABEL[filters.preset]} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricKpiCard index={0} icon="wallet" label="Revenue" value={pesoCentavos(kpis.mtdRevenueCentavos)} delta={kpis.revenueGrowthPct} comparisonLabel={kpis.comparisonPeriodLabel} sparkline={kpis.revenueSparkline} />
        <MetricKpiCard index={1} icon="trending-up" label="Net Profit" value={pesoCentavos(kpis.mtdNetProfitCentavos)} delta={kpis.profitGrowthPct} comparisonLabel={kpis.comparisonPeriodLabel} />
        <MetricKpiCard index={2} icon="percent" label="Profit Margin" value={`${kpis.marginPct}%`} delta={kpis.marginPctPointsDelta} deltaUnit="pts" comparisonLabel={kpis.comparisonPeriodLabel} />
        <MetricKpiCard index={3} icon="home" label="Occupancy" value={`${kpis.occupancyPct}%`} delta={null} comparisonLabel={kpis.comparisonPeriodLabel} />
        <MetricKpiCard index={4} icon="tag" label="ADR" value={peso(Math.round(kpis.adrCentavos / 100))} delta={null} comparisonLabel={kpis.comparisonPeriodLabel} />
        <MetricKpiCard index={5} icon="gauge" label="RevPAR" value={peso(Math.round(kpis.revparCentavos / 100))} delta={null} comparisonLabel={kpis.comparisonPeriodLabel} />
        <MetricKpiCard index={6} icon="calendar-check" label="Bookings" value={String(kpis.totalBookings)} delta={kpis.bookingsGrowthPct} comparisonLabel={kpis.comparisonPeriodLabel} />
      </div>

      <HowAreWeDoing kpis={kpis} />

      <KpiRow kpis={kpis} />
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!effectivePageAccess(user.role, user.additionalPageAccess, user.ownerEnabledModules).includes("/analytics")) redirect("/");

  const [availableUnits, availableBookers] = await Promise.all([
    prisma.unit.findMany({
      where: dashboardUnitIdWhere(user),
      orderBy: { sortOrder: "asc" },
      select: { id: true, shortName: true },
    }),
    prisma.employee.findMany({
      where: { ownerId: user.ownerId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const filters: AnalyticsFilters = {
    preset: (searchParams.period as AnalyticsPeriodPreset) || "month",
    customStart: searchParams.start,
    customEnd: searchParams.end,
    unitIds: searchParams.units ? searchParams.units.split(",").filter(Boolean) : null,
    bookerIds: searchParams.bookers ? searchParams.bookers.split(",").filter(Boolean) : null,
    platforms: searchParams.platforms ? searchParams.platforms.split(",").filter(Boolean) : null,
    stayTypes: searchParams.stayTypes ? searchParams.stayTypes.split(",").filter(Boolean) : null,
    statuses: searchParams.statuses ? (searchParams.statuses.split(",").filter(Boolean) as AnalyticsFilters["statuses"]) : null,
  };

  const firstName = user.name?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: undefined, year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      {/* Compact premium header — a subtle violet glow behind the greeting,
          not a second hero (MetricsHero below is the real hero); brief
          section 4 explicitly warns against consuming excessive vertical
          space here. */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full opacity-[0.14] blur-3xl"
          style={{ background: "var(--skin-primary, #6C5CE7)" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight sm:text-[22px]">
              {manilaTimeGreeting()}, {firstName} 👋
            </h1>
            <p className="mt-0.5 text-[13px] text-[var(--gray)]">Your Staycation Performance · {today}</p>
          </div>
          <SeasonalBadge showDefault />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Analytics</h2>
          <p className="mt-1 text-sm text-[var(--gray)]">Executive, Revenue, Financial, Booking, Occupancy, Guest, Housekeeping, and Staff analytics for your portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <AutoRefresh />
          <ExportMenu />
        </div>
      </div>

      <div className="mt-5">
        <AnalyticsFilterBar units={availableUnits} bookers={availableBookers} />
      </div>

      <Suspense fallback={<KpiRowSkeleton />} key={`kpi-${JSON.stringify(filters)}`}>
        <ExecutiveKpiSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
      </Suspense>

      <div className="mt-4">
        <AIInsightsPanel section="executive" filters={filters} title="AI Insights — Executive Summary" />
      </div>

      <div className="mt-4">
        <Suspense fallback={<SectionSkeleton />} key={`goals-${JSON.stringify(filters)}`}>
          <RevenueGoalsSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`forecast-${JSON.stringify(filters)}`}>
          <ForecastSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`revenue-${JSON.stringify(filters)}`}>
          <RevenueSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`financial-${JSON.stringify(filters)}`}>
          <FinancialSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-4">
        <AIInsightsPanel section="revenue" filters={filters} title="AI Insights — Revenue & Financial" />
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`booking-${JSON.stringify(filters)}`}>
          <BookingSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`occupancy-${JSON.stringify(filters)}`}>
          <OccupancySection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`guest-${JSON.stringify(filters)}`}>
          <GuestSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`hk-${JSON.stringify(filters)}`}>
          <HousekeepingSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`staff-${JSON.stringify(filters)}`}>
          <StaffSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`commission-${JSON.stringify(filters)}`}>
          <CommissionSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<SectionSkeleton />} key={`units-${JSON.stringify(filters)}`}>
          <UnitPerformanceSection user={{ role: user.role, ownedUnitIds: user.ownedUnitIds, ownerId: user.ownerId }} filters={filters} />
        </Suspense>
      </div>

      <div className="mt-4">
        <AIInsightsPanel section="operations" filters={filters} title="AI Insights — Operations & Team" />
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
