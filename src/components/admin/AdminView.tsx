"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UnitsTab } from "./UnitsTab";
import { UsersTab } from "./UsersTab";
import { SettingsTab } from "./SettingsTab";
import { BrandKitTab } from "./BrandKitTab";
import { StaycationProfileTab } from "./StaycationProfileTab";
import { ChecklistTab } from "./ChecklistTab";
import { LoginLogsTab } from "./LoginLogsTab";
import { HousekeepingActivityLogTab } from "./HousekeepingActivityLogTab";
import { ImpersonationLogsTab, type ImpersonationLog } from "./ImpersonationLogsTab";
import { CouponsTab } from "./CouponsTab";
import { FeedbackTab } from "./FeedbackTab";
import { DeploymentTab } from "./DeploymentTab";
import { PlaceInsightsPanel } from "./PlaceInsightsPanel";
import { SeasonalSkinsTab } from "./SeasonalSkinsTab";
import { AccessManagementTab } from "./AccessManagementTab";
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
const TABS = ["Units", "Users & roles", "Operations", "Feedback", "Deployment", "Settings"] as const;

// The Settings tab grew to 11 flat accordions as features shipped — hard to
// scan for "where's the thing I want." Grouped here into 4 subcategories
// (a second-level pill selector, same pattern as Operations' Bills/Supplies
// toggle above) purely for navigation; every existing Accordion/component
// underneath is unchanged, just organized under a shorter list at a time.
const SETTINGS_GROUPS = ["Branding & Appearance", "Business & Rates", "Access & Security", "Operations"] as const;
type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export function AdminView({
  units: initialUnits, users: initialUsers, settings: initialSettings, loginLogs,
  bills: initialBills, stocks: initialStocks, coupons: initialCoupons,
  feedback, feedbackAnalytics, guidebookCategories, placeInsightSummary, impersonationLogs, housekeepingActivityLogs,
  ownerProfile: initialOwnerProfile,
  isPlatformAdmin,
}: {
  units: any[]; users: any[]; settings: any; loginLogs: any[];
  bills: any[]; stocks: any[]; coupons: any[];
  feedback: any[]; feedbackAnalytics: any;
  guidebookCategories: any[]; placeInsightSummary: any[];
  impersonationLogs: ImpersonationLog[];
  housekeepingActivityLogs: any[];
  ownerProfile: { businessName: string; logoUrl: string | null };
  /** Deployment/maintenance events are a real platform-wide singleton, not
   * tenant data (DeploymentEvent has no ownerId) — the API routes behind
   * this tab are now platform-admin-gated, so the tab itself is hidden
   * from a regular tenant Owner/Admin rather than showing them a shell
   * that 403s on every action. */
  isPlatformAdmin: boolean;
}) {
  const searchParams = useSearchParams();
  const visibleTabs = isPlatformAdmin ? TABS : TABS.filter((t) => t !== "Deployment");
  const initialTab = visibleTabs.find((t) => t.toLowerCase() === searchParams?.get("tab")?.toLowerCase()) ?? "Units";
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const [units, setUnits] = useState(initialUnits);
  const [users, setUsers] = useState(initialUsers);
  const [bills, setBills] = useState(initialBills);
  const [stocks, setStocks] = useState(initialStocks);
  const [settings, setSettings] = useState(initialSettings);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [ownerProfile, setOwnerProfile] = useState(initialOwnerProfile);
  const [opsView, setOpsView] = useState<"Bills" | "Supplies">("Bills");
  const [settingsGroup, setSettingsGroup] = useState<SettingsGroup>("Branding & Appearance");

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
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-[13px] font-bold transition", tab !== t && "text-[var(--gray)] hover:bg-[var(--bg-2)]")}
            style={tab === t ? { background: "var(--skin-primary, #6c5ce7)", color: "var(--skin-primary-text, #fff)" } : undefined}
          >
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

      {tab === "Deployment" && <DeploymentTab />}

      {tab === "Settings" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {SETTINGS_GROUPS.map((g) => (
              <Pill key={g} on={settingsGroup === g} onClick={() => setSettingsGroup(g)}>{g}</Pill>
            ))}
          </div>

          {settingsGroup === "Branding & Appearance" && (
            <div>
              <Accordion title="Staycation Profile" sub="Your staycation's name and icon — shown in the nav bar" defaultOpen>
                <StaycationProfileTab initial={ownerProfile} onSaved={setOwnerProfile} />
              </Accordion>
              <Accordion title="Brand Kit" sub="Logo, colors, and social handles for exported graphics" defaultOpen={false}>
                <BrandKitTab initial={settings} onSaved={setSettings} />
              </Accordion>
              <Accordion title="Seasonal Skins" sub="Preview and activate site-wide seasonal themes" defaultOpen={false}>
                <SeasonalSkinsTab
                  activeSeasonalSkinId={settings.activeSeasonalSkinId ?? null}
                  onSaved={(patch) => setSettings((s: any) => ({ ...s, ...patch }))}
                />
              </Accordion>
            </div>
          )}

          {settingsGroup === "Business & Rates" && (
            <div>
              <Accordion title="Business & payroll rates" defaultOpen>
                <SettingsTab initial={settings} onSaved={setSettings} />
              </Accordion>
              <Accordion title="Coupons" defaultOpen={false}>
                <CouponsTab coupons={coupons} onCouponsChange={setCoupons} />
              </Accordion>
            </div>
          )}

          {settingsGroup === "Access & Security" && (
            <div>
              <Accordion title="Access Management" sub="Grant individual members extra page access beyond their role" defaultOpen>
                <AccessManagementTab />
              </Accordion>
              <Accordion title="Login logs" defaultOpen={false}>
                <LoginLogsTab logs={loginLogs} />
              </Accordion>
              <Accordion title="Security" sub="Impersonation logs" defaultOpen={false}>
                <ImpersonationLogsTab logs={impersonationLogs} />
              </Accordion>
            </div>
          )}

          {settingsGroup === "Operations" && (
            <div>
              <Accordion title="Housekeeping checklist" defaultOpen>
                <ChecklistTab initial={settings.checklistGroups ?? []} units={units} />
              </Accordion>
              <Accordion title="Housekeeping activity log" sub="Cleaning, access codes, shifts" defaultOpen={false}>
                <HousekeepingActivityLogTab logs={housekeepingActivityLogs} />
              </Accordion>
              <Accordion title="Nearby places data" defaultOpen={false}>
                <PlaceInsightsPanel categories={settings.guidebookCategories ?? guidebookCategories} initialSummary={placeInsightSummary} />
              </Accordion>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
