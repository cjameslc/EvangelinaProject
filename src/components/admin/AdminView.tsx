"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UnitsTab } from "./UnitsTab";
import { UsersTab } from "./UsersTab";
import { SettingsTab } from "./SettingsTab";
import { ChecklistTab } from "./ChecklistTab";
import { LoginLogsTab } from "./LoginLogsTab";
import { ImpersonationLogsTab, type ImpersonationLog } from "./ImpersonationLogsTab";
import { CouponsTab } from "./CouponsTab";
import { FeedbackTab } from "./FeedbackTab";
import { PlaceInsightsPanel } from "./PlaceInsightsPanel";
import { BillsPanel } from "@/components/housekeeping/BillsPanel";
import { StockPanel } from "@/components/housekeeping/StockPanel";
import { Pill } from "@/components/ui/Pill";
import { Accordion } from "@/components/ui/Accordion";
import { cn } from "@/lib/utils";

// Staff/salary management (add, edit rates, deactivate) lives entirely
// under My Earnings -> Owner Summary now, not here — that view already does
// everything the old Staff tab used to (plus payroll "mark given"
// tracking), so keeping both was just two places that could drift out of
// sync. The old Weekly report tab (ad-spend logging + per-employee payroll
// breakdown) was removed outright with no replacement — a deliberate call,
// not an oversight.
//
// Bills + Supplies are folded into one "Operations" tab (both are small,
// unit-scoped list panels reusing the exact same components Housekeeping
// itself uses); Housekeeping checklist + Login logs are folded into
// "Settings" as collapsible sections, since the checklist already lives on
// the same Settings record. Units and Users & roles are untouched.
const TABS = ["Units", "Users & roles", "Operations", "Feedback", "Settings"] as const;

export function AdminView({
  units: initialUnits, users: initialUsers, settings: initialSettings, loginLogs,
  bills: initialBills, stocks: initialStocks, coupons: initialCoupons,
  feedback, feedbackAnalytics, guidebookCategories, placeInsightSummary, impersonationLogs,
}: {
  units: any[]; users: any[]; settings: any; loginLogs: any[];
  bills: any[]; stocks: any[]; coupons: any[];
  feedback: any[]; feedbackAnalytics: any;
  guidebookCategories: any[]; placeInsightSummary: any[];
  impersonationLogs: ImpersonationLog[];
}) {
  const searchParams = useSearchParams();
  const initialTab = TABS.find((t) => t.toLowerCase() === searchParams?.get("tab")?.toLowerCase()) ?? "Units";
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const [units, setUnits] = useState(initialUnits);
  const [users, setUsers] = useState(initialUsers);
  const [bills, setBills] = useState(initialBills);
  const [stocks, setStocks] = useState(initialStocks);
  const [settings, setSettings] = useState(initialSettings);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [opsView, setOpsView] = useState<"Bills" | "Supplies">("Bills");

  async function refreshBills() {
    const res = await fetch("/api/housekeeping/bills");
    if (res.ok) setBills(await res.json());
  }
  async function refreshStocks() {
    const res = await fetch("/api/housekeeping/stocks");
    if (res.ok) setStocks(await res.json());
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-9 sm:px-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Admin</h1>
        <p className="mt-1 text-[14.5px] text-[var(--gray)]">Manage units, staff accounts, roles, and site-wide settings.</p>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-[13px] font-bold transition", tab === t ? "bg-rausch text-white" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Units" && <UnitsTab units={units} onUnitsChange={setUnits} ownerCandidates={users.filter((u: any) => u.role === "CO_OWNER" || u.role === "OWNER_ADMIN")} />}
      {tab === "Users & roles" && <UsersTab users={users} onUsersChange={setUsers} units={units} />}

      {tab === "Operations" && (
        <div>
          <div className="mb-4 flex gap-1.5">
            <Pill on={opsView === "Bills"} onClick={() => setOpsView("Bills")}>Bills</Pill>
            <Pill on={opsView === "Supplies"} onClick={() => setOpsView("Supplies")}>Supplies</Pill>
          </div>
          {opsView === "Bills" && <BillsPanel units={units} bills={bills} canEdit canTogglePaid={false} showMetrics={false} collapsible onChanged={refreshBills} />}
          {opsView === "Supplies" && <StockPanel units={units} stocks={stocks} canEdit onChanged={refreshStocks} />}
        </div>
      )}

      {tab === "Feedback" && <FeedbackTab feedback={feedback} analytics={feedbackAnalytics} />}

      {tab === "Settings" && (
        <div>
          <Accordion title="Business & payroll rates">
            <SettingsTab initial={settings} onSaved={setSettings} />
          </Accordion>
          <Accordion title="Coupons" defaultOpen={false}>
            <CouponsTab coupons={coupons} onCouponsChange={setCoupons} />
          </Accordion>
          <Accordion title="Housekeeping checklist" defaultOpen={false}>
            <ChecklistTab initial={settings.checklistGroups ?? []} units={units} />
          </Accordion>
          <Accordion title="Login logs" defaultOpen={false}>
            <LoginLogsTab logs={loginLogs} />
          </Accordion>
          <Accordion title="Security" sub="Impersonation logs" defaultOpen={false}>
            <ImpersonationLogsTab logs={impersonationLogs} />
          </Accordion>
          <Accordion title="Nearby places data" defaultOpen={false}>
            <PlaceInsightsPanel categories={settings.guidebookCategories ?? guidebookCategories} initialSummary={placeInsightSummary} />
          </Accordion>
        </div>
      )}
    </div>
  );
}
