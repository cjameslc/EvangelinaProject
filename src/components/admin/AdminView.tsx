"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UnitsTab } from "./UnitsTab";
import { UsersTab } from "./UsersTab";
import { StaffTab } from "./StaffTab";
import { SettingsTab } from "./SettingsTab";
import { ChecklistTab } from "./ChecklistTab";
import { LoginLogsTab } from "./LoginLogsTab";
import { WeeklyReport } from "@/components/dashboard/WeeklyReport";
import { BillsPanel } from "@/components/housekeeping/BillsPanel";
import { StockPanel } from "@/components/housekeeping/StockPanel";
import { cn } from "@/lib/utils";

const TABS = ["Units", "Users & roles", "Staff", "Bills", "Supplies", "Housekeeping checklist", "Login logs", "Weekly report", "Settings"] as const;

export function AdminView({
  units: initialUnits, users: initialUsers, settings: initialSettings, loginLogs, weeklyReportBookings, employees: initialEmployees, weeklyExpenses, cleaningLogs, canEditExpenses,
  bills: initialBills, stocks: initialStocks,
}: {
  units: any[]; users: any[]; settings: any; loginLogs: any[];
  weeklyReportBookings: any[]; employees: any[]; weeklyExpenses: any[]; cleaningLogs: any[]; canEditExpenses: boolean;
  bills: any[]; stocks: any[];
}) {
  const searchParams = useSearchParams();
  const initialTab = TABS.find((t) => t.toLowerCase() === searchParams?.get("tab")?.toLowerCase()) ?? "Units";
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const [units, setUnits] = useState(initialUnits);
  const [users, setUsers] = useState(initialUsers);
  const [bills, setBills] = useState(initialBills);
  const [stocks, setStocks] = useState(initialStocks);
  const [employees, setEmployees] = useState(initialEmployees);
  const [settings, setSettings] = useState(initialSettings);

  async function refreshBills() {
    const res = await fetch("/api/housekeeping/bills");
    if (res.ok) setBills(await res.json());
  }
  async function refreshStocks() {
    const res = await fetch("/api/housekeeping/stocks");
    if (res.ok) setStocks(await res.json());
  }
  async function refreshEmployees() {
    const res = await fetch("/api/employees");
    if (res.ok) setEmployees(await res.json());
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
      {tab === "Staff" && (
        <StaffTab
          employees={employees}
          onChanged={refreshEmployees}
          weekBookings={weeklyReportBookings}
          weekExpenses={weeklyExpenses}
          cleaningLogs={cleaningLogs}
          payrollRates={{
            housekeepingDayRate: settings.housekeepingDayRate,
            housekeepingNightBonus: settings.housekeepingNightBonus,
            bookerCommission: settings.bookerCommission,
            auditorWeeklyRate: settings.auditorWeeklyRate,
          }}
        />
      )}
      {tab === "Bills" && <BillsPanel units={units} bills={bills} canEdit canTogglePaid={false} showMetrics={false} collapsible onChanged={refreshBills} />}
      {tab === "Supplies" && <StockPanel units={units} stocks={stocks} canEdit onChanged={refreshStocks} />}
      {tab === "Housekeeping checklist" && <ChecklistTab initial={settings.checklistGroups ?? []} units={units} />}
      {tab === "Login logs" && <LoginLogsTab logs={loginLogs} />}
      {tab === "Weekly report" && (
        <WeeklyReport
          bookings={weeklyReportBookings}
          units={units}
          employees={employees}
          initialExpenses={weeklyExpenses}
          canEditExpenses={canEditExpenses}
          cleaningLogs={cleaningLogs}
          payrollRates={{
            housekeepingDayRate: settings.housekeepingDayRate,
            housekeepingNightBonus: settings.housekeepingNightBonus,
            bookerCommission: settings.bookerCommission,
            auditorWeeklyRate: settings.auditorWeeklyRate,
          }}
        />
      )}
      {tab === "Settings" && <SettingsTab initial={settings} onSaved={setSettings} />}
    </div>
  );
}
