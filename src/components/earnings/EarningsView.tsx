"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { StatCard } from "@/components/ui/StatCard";
import { Accordion } from "@/components/ui/Accordion";
import { PageLoading } from "@/components/ui/PageLoading";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDate, manilaWeekRange, manilaMonthStart, initials } from "@/lib/format";
import { ROLE_LABEL, TEAMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { FilePdfIcon, PlusIcon, TrashIcon, EditIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { Trophy, Medal, Award, type LucideIcon } from "lucide-react";
import { monthlySalaryFromRate, weeklySalaryFor, isPayrollRole, type SalaryType } from "@/lib/payroll";
import { playFanfare, playPop } from "@/lib/sound";

// Festive top-3 treatment for the Leaderboard — gold/silver/bronze medal
// badge, a matching soft gradient wash, and a glow ring, so the top spots
// read as a podium at a glance instead of a plain numbered list.
const RANK_STYLE: Record<number, { medal: LucideIcon; badgeBg: string; card: string; ring: string }> = {
  1: { medal: Trophy, badgeBg: "linear-gradient(135deg,#FFE082,#C87D00)", card: "bg-gradient-to-r from-amber/20 via-amber/5 to-transparent", ring: "ring-2 ring-amber/60" },
  2: { medal: Medal, badgeBg: "linear-gradient(135deg,#E9EDF2,#94A3B8)", card: "bg-gradient-to-r from-slate-300/25 via-slate-300/5 to-transparent", ring: "ring-2 ring-slate-300/70" },
  3: { medal: Award, badgeBg: "linear-gradient(135deg,#FDBA74,#B45309)", card: "bg-gradient-to-r from-orange-400/20 via-orange-400/5 to-transparent", ring: "ring-2 ring-orange-400/60" },
};

type EmployeeLite = { id: string; name: string; role: string };
type UnitLite = { id: string; name: string; shortName: string };
type ExpenseRequestRow = {
  id: string; category: string; amount: number; note: string; date: string; status: string;
  rejectionReason: string | null; unit: UnitLite | null; receiptUrl: string | null;
};
type PendingRequestRow = ExpenseRequestRow & { employee: { id: string; name: string; role: string } };
type FullEmployee = { id: string; name: string; role: string; monthlySalary: number; salaryType: SalaryType; salaryRate: number; active: boolean };
type AchievementDefRow = { id: string; label: string; threshold: number; rewardAmount: number; personalMessage: string | null };

const EXPENSE_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber/15 text-amber",
  APPROVED: "bg-green/15 text-green",
  REJECTED: "bg-rausch/15 text-rausch",
};

// Sentinel value for the employee-picker dropdown's owner-only first
// option — switches the whole page into the company-wide summary/approval
// view instead of fetching one specific employee's earnings.
const OWNER_SUMMARY_VALUE = "__owner_summary__";
type TeamLineItem = { label: string; detail: string; amount: number; deduction?: boolean };
type EliteTierStatus = { tier: number; amount: number; stars: number; badge: string; medal: string; slotsTotal: number; slotsTaken: number; wonByMe: boolean };
type EliteChallenge = {
  completedThisMonth: number; rank: number; totalBookers: number;
  currentTier: number | null; currentStars: number; currentBadge: string | null;
  nextTier: number | null; nextTierAmount: number | null; remaining: number; progressPct: number;
  slotsRemainingForNextTier: number; slotsTotalForNextTier: number;
  estimatedCommission: number; potentialBonus: number; tiers: EliteTierStatus[];
};
type Achievement = { id: string; label: string; unlocked: boolean; threshold?: number; rewardAmount?: number; personalMessage?: string | null };
type PayrollHistoryRow = { weekStart: string; weekEnd: string; salary: number; activity: number; bookingCount: number; bonuses: number; total: number; status: string };
type BonusAward = { id: string; month: string; tier: number; amount: number; slotRank: number; completedAt: string };
type Adjustment = { id: string; date: string; amount: number; note: string; deduction: boolean };
type SuccessfulBookingRow = { id: string; guestName: string; unit: string; date: string; commissionEarned: number; status: string };
type NightCleanBonusRow = { bookingId: string; unit: string; checkInTime: string | null; additionalCleaningCount: number; bonus: number; qualified: boolean; status: string };
type MyTeam = { key: string; members: { id: string; name: string; role: string }[]; statsThisMonth: { successfulBookings: number; revenue: number } };
type EarningsData = {
  employee: { id: string; name: string; role: string; salaryType: string; salaryRate: number; monthlySalary: number; fixedSalaryCoversCleaning?: boolean };
  salaryThisWeek: number;
  thisWeek: { total: number; items: TeamLineItem[]; subtitle: string };
  pendingPayroll: number;
  upcomingPayrollDate: string;
  grossThisMonth: number;
  netThisMonth: number;
  lifetimeEarnings: number;
  eliteChallenge: EliteChallenge | null;
  achievements: Achievement[];
  payrollHistory: PayrollHistoryRow[];
  bonusAwards: BonusAward[];
  adjustments: Adjustment[];
  expenseRequests: ExpenseRequestRow[];
  team: MyTeam | null;
  successfulBookings: SuccessfulBookingRow[];
  nightCleanBonusRows: NightCleanBonusRow[];
};
type LeaderboardRow = { employeeId: string; name: string; avatarUrl: string | null; avatarColor: string; completedThisMonth: number; commissionThisMonth: number; bonusThisMonth: number };
type LeaderboardData =
  | { scope: "all"; leaderboard: LeaderboardRow[] }
  | { scope: "own"; rank: number | null; total: number; own: LeaderboardRow | null };

/**
 * Inline-editable "Base salary" figure on My Earnings — Owner/Co-owner only
 * (the Team section further down can already do this, but it means
 * scrolling past everything else; this lets an owner fix a number right
 * where they're looking at it). Directly edits the monthly-equivalent
 * value while preserving the employee's existing salaryType (DAILY/WEEKLY/
 * MONTHLY) — reverses monthlySalaryFromRate to find the rate, in that same
 * cadence, that produces the entered monthly figure, so adjusting this
 * never silently switches someone's pay cadence as a side effect.
 */
function BaseSalaryStat({
  employeeId, monthlySalary, salaryType, editable, onSaved,
}: {
  employeeId: string; monthlySalary: number; salaryType: string; editable: boolean; onSaved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(monthlySalary));
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setVal(String(monthlySalary));
    setEditing(true);
  }

  async function save() {
    const n = Number(val.trim());
    if (!val.trim() || Number.isNaN(n) || n < 0) { toast("Enter a valid amount", true); return; }
    const rate =
      salaryType === "DAILY" ? Math.round((n * 12) / 365) :
      salaryType === "WEEKLY" ? Math.round((n * 12) / 52) :
      n;
    setSaving(true);
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salaryType, salaryRate: rate }),
    });
    setSaving(false);
    if (!res.ok) { toast("Couldn't update base salary", true); return; }
    toast("Base salary updated ✓");
    setEditing(false);
    onSaved();
  }

  if (!editable) return <>{peso(monthlySalary)}</>;

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number" min={0} autoFocus value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-24 rounded-lg border border-[var(--line-2)] bg-[var(--card)] px-2 py-1 text-[18px] font-extrabold text-[var(--ink)]"
        />
        <button onClick={save} disabled={saving} className="text-[11px] font-extrabold text-rausch disabled:opacity-50">{saving ? "…" : "Save"}</button>
        <button onClick={() => setEditing(false)} disabled={saving} className="text-[11px] font-extrabold text-[var(--gray)]">Cancel</button>
      </div>
    );
  }

  return (
    <button type="button" onClick={startEdit} className="group inline-flex items-center gap-1.5 text-left">
      <span>{peso(monthlySalary)}</span>
      <EditIcon className="h-3.5 w-3.5 text-[var(--gray)]/50 group-hover:text-rausch" />
    </button>
  );
}

export function EarningsView({
  role, isAdminViewer, ownEmployeeId, employees,
}: {
  role: string;
  isAdminViewer: boolean;
  ownEmployeeId: string | null;
  employees: EmployeeLite[];
}) {
  const { data: session } = useSession();
  // Owners land on the company-wide summary by default rather than a
  // specific employee's earnings — that's the primary reason for being on
  // this page as an owner in the first place.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    isAdminViewer ? OWNER_SUMMARY_VALUE : ownEmployeeId ?? employees[0]?.id ?? null
  );
  const isOwnerSummary = isAdminViewer && selectedEmployeeId === OWNER_SUMMARY_VALUE;
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [historySearch, setHistorySearch] = useState("");

  // Range filter for the Successful Bookings / Night Clean Bonus tables —
  // defaults to "this week", reuses the exact same filter bar/param shape
  // Owner Summary's Executive Summary already uses.
  const [tableRangeChoice, setTableRangeChoice] = useState<RangeChoice>("this_week");
  const [tableCustomStart, setTableCustomStart] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [tableCustomEnd, setTableCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  async function load() {
    if (selectedEmployeeId === OWNER_SUMMARY_VALUE) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (selectedEmployeeId) params.set("employeeId", selectedEmployeeId);
      const rangeParams = rangeChoiceToParams(tableRangeChoice, tableCustomStart, tableCustomEnd);
      for (const [k, v] of Object.entries(rangeParams)) params.set(k, String(v));
      const res = await fetch(`/api/my-earnings?${params.toString()}`);
      if (!res.ok) throw new Error();
      const j = await res.json();
      setData(j);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, tableRangeChoice, tableCustomStart, tableCustomEnd]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setLeaderboard(j))
      .catch(() => {});
  }, []);

  // Owner-only: the Owner Summary view's data (team salary, pending-approvals
  // queue) is company-wide, independent of the per-employee earnings fetch
  // above — loaded once, refreshed on demand.
  const [teamEmployees, setTeamEmployees] = useState<FullEmployee[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  async function refreshTeamEmployees() {
    const res = await fetch("/api/employees");
    if (res.ok) setTeamEmployees(await res.json());
  }
  async function refreshPendingRequests() {
    const res = await fetch("/api/expense-requests?status=PENDING");
    if (res.ok) setPendingRequests(await res.json());
  }
  useEffect(() => {
    if (!isAdminViewer) return;
    refreshTeamEmployees();
    refreshPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminViewer]);

  // Employee-only: units for the "Unit Expense" picker on the submit form.
  const [units, setUnits] = useState<UnitLite[]>([]);
  useEffect(() => {
    if (isAdminViewer) return;
    fetch("/api/units")
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setUnits(j.map((u: any) => ({ id: u.id, name: u.name, shortName: u.shortName }))))
      .catch(() => {});
  }, [isAdminViewer]);

  const filteredHistory = useMemo(() => {
    if (!data) return [];
    if (!historySearch.trim()) return data.payrollHistory;
    const q = historySearch.toLowerCase();
    return data.payrollHistory.filter((h) => fmtDate(h.weekStart, { month: "short", day: "numeric" }).toLowerCase().includes(q));
  }, [data, historySearch]);

  async function exportPDF() {
    if (!data) return;
    // Loaded on demand — jsPDF/autoTable are only needed by this click
    // handler, not on every Earnings page load.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    const rausch = [255, 56, 92];
    const tableOpts: any = {
      theme: "plain",
      headStyles: { fillColor: rausch, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9.5, cellPadding: 3, lineColor: [230, 230, 230], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
    };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(session?.user?.ownerBusinessName || "Evangelina's Staycation", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(110);
    doc.text(`My Earnings - ${data.employee.name} (${ROLE_LABEL[data.employee.role] ?? data.employee.role})`, 14, 25);
    doc.setTextColor(0);
    let y = 32;
    autoTable(doc, {
      ...tableOpts, startY: y, head: [["Summary", ""]],
      body: [
        ["Salary this week", peso(data.salaryThisWeek)],
        ["Activity this week", peso(data.thisWeek.total)],
        ["Pending payroll", peso(data.pendingPayroll)],
        ["Gross this month", peso(data.grossThisMonth)],
        ["Net this month", peso(data.netThisMonth)],
        ["Lifetime earnings", peso(data.lifetimeEarnings)],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    autoTable(doc, {
      ...tableOpts, startY: y, head: [["Week", "Salary", "Activity", "Bonuses", "Total"]],
      body: data.payrollHistory.map((h) => [
        `${fmtDate(h.weekStart, { month: "short", day: "numeric" })} - ${fmtDate(h.weekEnd, { month: "short", day: "numeric" })}`,
        peso(h.salary), peso(h.activity), peso(h.bonuses), peso(h.total),
      ]),
    });
    doc.save(`earnings-${data.employee.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }

  const employeePicker = isAdminViewer && (
    <select value={selectedEmployeeId ?? ""} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="field-input w-auto">
      <option value={OWNER_SUMMARY_VALUE}>Owner Summary</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>{e.name} · {ROLE_LABEL[e.role] ?? e.role}</option>
      ))}
    </select>
  );

  if (isOwnerSummary) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-9 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">My Earnings</h1>
            <p className="mt-1 text-[14.5px] text-[var(--gray)]">Owner Summary · all staff</p>
          </div>
          {employeePicker}
        </div>
        <OwnerSummarySection
          role={role}
          teamEmployees={teamEmployees}
          onEmployeesChanged={refreshTeamEmployees}
          pendingRequests={pendingRequests}
          onRequestsChanged={refreshPendingRequests}
        />
      </div>
    );
  }

  if (loading && !data) return <PageLoading />;

  if (error || (data && (data as any).error)) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-9 sm:px-6">
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-center text-[14px] text-[var(--gray)]">
          {(data as any)?.error ?? "Couldn't load earnings — try again."}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-9 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">My Earnings</h1>
          <p className="mt-1 text-[14.5px] text-[var(--gray)]">
            {data.employee.name} · {ROLE_LABEL[data.employee.role] ?? data.employee.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {employeePicker}
          <button onClick={exportPDF} className="btn btn-sm">
            <FilePdfIcon className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* Payroll Card — Current Week Payroll, Upcoming Payroll Date, Fixed
          Salary, Commission, Bonuses, Total Payroll, formula spelled out
          below. Simplified from the old 8-card grid (Gross/Net/Lifetime
          dropped — owner-facing detail, not what a staff member needs at a
          glance). */}
      <div className="card mb-5 p-5">
        <h2 className="text-[15px] font-extrabold">Payroll</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Current Week Payroll" value={peso(data.pendingPayroll)} sub="salary + activity" />
          <StatCard label="Upcoming Payroll Date" value={fmtDate(data.upcomingPayrollDate, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} />
          <StatCard
            label="Fixed Salary"
            value={
              <BaseSalaryStat
                employeeId={data.employee.id}
                monthlySalary={data.employee.monthlySalary}
                salaryType={data.employee.salaryType}
                editable={isAdminViewer && !isOwnerSummary}
                onSaved={load}
              />
            }
            sub="monthly equivalent"
          />
          <StatCard label="Commission" value={peso(data.thisWeek.items.filter((i) => i.label === "Booking commission").reduce((s, i) => s + i.amount, 0))} sub="this week" />
          <StatCard label="Bonuses" value={peso(data.bonusAwards.reduce((s, a) => s + a.amount, 0) + data.thisWeek.items.filter((i) => i.label === "Night Clean Bonus").reduce((s, i) => s + i.amount, 0))} sub="Elite + Night Clean, this week" />
          <StatCard label="Total Payroll" value={peso(data.pendingPayroll)} sub="fixed + commission + bonuses" />
        </div>

        <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Total Payroll = Fixed Salary + Commission + Approved Bonuses</p>
          <div className="flex items-center justify-between text-[13px]">
            <div>
              <div className="font-bold">Salary this week</div>
              <div className="text-[11.5px] text-[var(--gray)]">flat rate ÷ 52 weeks, from your Staff record</div>
            </div>
            <div className="font-bold">{peso(data.salaryThisWeek)}</div>
          </div>
          {data.thisWeek.items.length === 0 && <p className="text-[12.5px] text-[var(--gray)]">No commission/incentive activity this week.</p>}
          {data.thisWeek.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[13px]">
              <div>
                <div className="font-bold">{item.label}</div>
                <div className="text-[11.5px] text-[var(--gray)]">{item.detail}</div>
              </div>
              <div className={cn("font-bold", item.deduction && "text-rausch")}>{item.deduction ? "−" : ""}{peso(item.amount)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-dashed border-[var(--line-2)] pt-2 text-[13px] font-extrabold">
            <span>Total this week</span>
            <span>{peso(data.pendingPayroll)}</span>
          </div>
        </div>
      </div>

      {(data.employee.role === "BOOKER" || (data.employee.role === "HOUSEKEEPING" && data.employee.fixedSalaryCoversCleaning)) && (
        <div className="mb-3">
          <RangeFilterBar
            choice={tableRangeChoice} onChoice={setTableRangeChoice}
            customStart={tableCustomStart} customEnd={tableCustomEnd}
            onCustomStart={setTableCustomStart} onCustomEnd={setTableCustomEnd}
          />
        </div>
      )}

      {data.employee.role === "BOOKER" && (
        <Accordion title="Successful Bookings" sub={`${data.successfulBookings.length} this range · ${peso(data.successfulBookings.reduce((s, b) => s + b.commissionEarned, 0))} commission`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
                  <th className="py-2 pr-3">Guest</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 text-right">Commission</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.successfulBookings.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-[var(--gray)]">No successful bookings in this range.</td></tr>}
                {data.successfulBookings.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="py-2 pr-3 font-semibold">{b.guestName}</td>
                    <td className="py-2 pr-3">{b.unit}</td>
                    <td className="py-2 pr-3">{fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}</td>
                    <td className="py-2 pr-3 text-right font-bold">{peso(b.commissionEarned)}</td>
                    <td className="py-2">{b.status}</td>
                  </tr>
                ))}
              </tbody>
              {data.successfulBookings.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--line)] font-extrabold">
                    <td className="py-2 pr-3" colSpan={3}>Total</td>
                    <td className="py-2 pr-3 text-right">{peso(data.successfulBookings.reduce((s, b) => s + b.commissionEarned, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Accordion>
      )}

      {data.employee.role === "HOUSEKEEPING" && data.employee.fixedSalaryCoversCleaning && (
        <Accordion title="Night Clean Bonus" sub={`${data.nightCleanBonusRows.filter((r) => r.qualified).length} qualifying this range · ${peso(data.nightCleanBonusRows.reduce((s, r) => s + r.bonus, 0))}`}>
          <p className="mb-3 text-[12px] text-[var(--gray)]">Your fixed salary already covers regular cleaning — only qualifying Night Clean Bonuses show below as extra activity income.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Check-in Time</th>
                  <th className="py-2 pr-3 text-right">Additional Cleanings</th>
                  <th className="py-2 pr-3 text-right">Bonus</th>
                  <th className="py-2 pr-3">Qualified</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.nightCleanBonusRows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-[var(--gray)]">No cleanings recorded in this range.</td></tr>}
                {data.nightCleanBonusRows.map((r) => (
                  <tr key={r.bookingId} className="border-b border-[var(--line)] last:border-0">
                    <td className="py-2 pr-3 font-semibold">{r.unit}</td>
                    <td className="py-2 pr-3">{r.checkInTime ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{r.additionalCleaningCount}</td>
                    <td className="py-2 pr-3 text-right font-bold">{r.bonus > 0 ? peso(r.bonus) : "—"}</td>
                    <td className="py-2 pr-3">{r.qualified ? <span className="rounded-full bg-green/15 px-2 py-0.5 text-[11px] font-extrabold text-green">Eligible</span> : <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--gray)]">Not eligible</span>}</td>
                    <td className="py-2 text-[11.5px] text-[var(--gray)]">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>
      )}

      {data.team && (
        <div className="card mb-5 p-5">
          <h2 className="text-[15px] font-extrabold">{TEAMS[data.team.key]?.emoji} My Team — {TEAMS[data.team.key]?.name}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data.team.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-full border border-[var(--line)] py-1 pl-1 pr-3">
                <span className="grid h-7 w-7 place-items-center rounded-full text-[10.5px] font-bold text-white" style={{ background: TEAMS[data.team!.key]?.color }}>{initials(m.name)}</span>
                <span className="text-[12.5px] font-semibold">{m.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <StatCard label="Team bookings" value={String(data.team.statsThisMonth.successfulBookings)} sub="this month" />
            <StatCard label="Team revenue" value={peso(data.team.statsThisMonth.revenue)} sub="this month" />
          </div>
        </div>
      )}

      {/* Gamification — the Elite Booker Challenge world map + Achievement
          badges are retired for now; a real replacement is coming. Nothing
          from the old system (tiers, badges, awards) renders here anymore. */}
      <div className="card mb-5 p-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-2)] text-3xl">🚧</div>
        <h2 className="text-[16px] font-extrabold">Coming Soon</h2>
        <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] text-[var(--gray)]">A new rewards &amp; recognition experience is on the way. Check back soon.</p>
      </div>

      <Accordion title="Payroll history" sub="last 10 weeks">
        <input
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          placeholder="Search by date…"
          className="field-input mb-3 max-w-[240px]"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Bookings</th>
                <th className="py-2 pr-3 text-right">Salary</th>
                <th className="py-2 pr-3 text-right">Activity</th>
                <th className="py-2 pr-3 text-right">Bonuses</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h, i) => (
                <tr key={i} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3 font-semibold">{fmtDate(h.weekStart, { month: "short", day: "numeric" })} – {fmtDate(h.weekEnd, { month: "short", day: "numeric" })}</td>
                  <td className="py-2 pr-3">{h.bookingCount || "—"}</td>
                  <td className="py-2 pr-3 text-right">{peso(h.salary)}</td>
                  <td className="py-2 pr-3 text-right">{peso(h.activity)}</td>
                  <td className="py-2 pr-3 text-right">{peso(h.bonuses)}</td>
                  <td className="py-2 pr-3 text-right font-bold">{peso(h.total)}</td>
                  <td className="py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-extrabold", h.status === "Current period" ? "bg-teal/15 text-teal" : "bg-[var(--bg-2)] text-[var(--gray)]")}>
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Accordion>

      {data.adjustments.length > 0 && (
        <Accordion title="Manual adjustments" sub="bonuses, deductions, cash advances, etc.">
          <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
            {data.adjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-t border-[var(--line)] p-3.5 first:border-0">
                <div>
                  <div className="text-[13.5px] font-bold">{a.note}</div>
                  <div className="text-[11.5px] text-[var(--gray)]">{fmtDate(a.date, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}</div>
                </div>
                <div className={cn("font-bold", a.deduction && "text-rausch")}>{a.deduction ? "−" : "+"}{peso(a.amount)}</div>
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {!isAdminViewer && (
        <Accordion title="Submit an expense" sub="TikTok ads or a unit expense not otherwise covered">
          <ExpenseSubmitForm units={units} onSubmitted={load} />
        </Accordion>
      )}

      {data.expenseRequests.length > 0 && (
        <Accordion title={isAdminViewer ? `${data.employee.name}'s expense requests` : "My expense requests"} sub={`${data.expenseRequests.length} submitted`}>
          <MyExpenseRequestsList requests={data.expenseRequests} onChanged={load} readOnly={isAdminViewer} />
        </Accordion>
      )}

      <Accordion title="Leaderboard" sub={leaderboard?.scope === "all" ? "top bookers, this month" : "your ranking"}>
        {!leaderboard && <p className="text-[13px] text-[var(--gray)]">Loading…</p>}
        {leaderboard?.scope === "all" && (
          <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
            {leaderboard.leaderboard.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No bookers on file.</p>}
            {leaderboard.leaderboard.map((r, i) => {
              const rank = i + 1;
              const style = RANK_STYLE[rank];
              return (
                <button
                  type="button"
                  key={r.employeeId}
                  onClick={() => (rank <= 3 ? playFanfare() : playPop())}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className={cn(
                    "flex w-full animate-pop-in items-center gap-3 border-t border-[var(--line)] p-3.5 text-left transition-transform first:border-0 hover:-translate-y-0.5",
                    style && style.card
                  )}
                >
                  <span className={cn("relative h-9 w-9 flex-none rounded-full", style && cn("animate-glow-pulse shadow-md", style.ring))}>
                    {r.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatarUrl} alt={r.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span
                        className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold text-white"
                        style={{ background: r.avatarColor }}
                      >
                        {initials(r.name)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full text-[9.5px] font-extrabold ring-2 ring-[var(--card)]",
                        style ? "text-white" : "bg-[var(--bg-2)] text-[var(--gray)]"
                      )}
                      style={style ? { background: style.badgeBg } : undefined}
                    >
                      {style ? <style.medal className="h-[10px] w-[10px]" /> : rank}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[13.5px] font-bold", rank === 1 && "text-amber")}>{r.name}</div>
                    <div className="text-[11.5px] text-[var(--gray)]">{r.completedThisMonth} bookings this month</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold">{peso(r.commissionThisMonth + r.bonusThisMonth)}</div>
                    <div className="text-[11px] text-[var(--gray)]">commission + bonus</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {leaderboard?.scope === "own" && (
          <div
            className={cn(
              "rounded-2xl border p-5 text-center",
              leaderboard.rank && RANK_STYLE[leaderboard.rank] ? cn("border-transparent", RANK_STYLE[leaderboard.rank].card) : "border-[var(--line)]"
            )}
          >
            {leaderboard.rank ? (
              <>
                {leaderboard.own && (
                  <div className="mx-auto mb-1 h-14 w-14">
                    {leaderboard.own.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={leaderboard.own.avatarUrl} alt={leaderboard.own.name} className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <span
                        className="grid h-14 w-14 place-items-center rounded-full text-[18px] font-bold text-white"
                        style={{ background: leaderboard.own.avatarColor }}
                      >
                        {initials(leaderboard.own.name)}
                      </span>
                    )}
                  </div>
                )}
                {RANK_STYLE[leaderboard.rank] && (
                  <div className="flex animate-float justify-center text-amber">
                    {(() => { const RankIcon = RANK_STYLE[leaderboard.rank].medal; return <RankIcon className="h-9 w-9" />; })()}
                  </div>
                )}
                <div className="text-3xl font-extrabold text-rausch">#{leaderboard.rank}</div>
                <p className="mt-1 text-[13px] text-[var(--gray)]">out of {leaderboard.total} booker{leaderboard.total === 1 ? "" : "s"} this month</p>
                {leaderboard.own && <p className="mt-2 text-[13px] font-semibold">{leaderboard.own.completedThisMonth} completed bookings</p>}
              </>
            ) : (
              <p className="text-[13px] text-[var(--gray)]">Not ranked yet — no completed bookings this month.</p>
            )}
          </div>
        )}
      </Accordion>
    </div>
  );
}

const EXPENSE_CATEGORY_LABEL: Record<string, string> = { TIKTOK_ADS: "TikTok Ads", UNIT_EXPENSE: "Unit Expense", PASA_GUEST: "Pasa Guest", OTHER: "Other" };

// Employee-facing submission form — TikTok Ads (company-wide), Unit Expense
// (requires picking which unit), Pasa Guest (an item bought on a guest's
// behalf, reimbursed), or Other (anything else, explained in the note).
// Submits PENDING; never affects Realized/Forecast profit or payroll until
// an Owner/Admin approves it.
/** Manual free-text entries (an expense note, etc.) always get their first
 * letter capitalized on submit — a small consistency touch so "shower" and
 * "Shower" don't show up side by side depending on who typed it. */
function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function ExpenseSubmitForm({ units, onSubmitted }: { units: UnitLite[]; onSubmitted: () => void }) {
  const toast = useToast();
  const [category, setCategory] = useState<"TIKTOK_ADS" | "UNIT_EXPENSE" | "PASA_GUEST" | "OTHER">("TIKTOK_ADS");
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Bumped after every successful submit to remount the file input — setting
  // receiptUrl back to null alone clears our own state, but a browser file
  // input keeps showing the previously chosen filename until the element
  // itself is recreated (its `value` can't be cleared programmatically).
  const [fileInputKey, setFileInputKey] = useState(0);

  async function onReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/expense-requests/photo", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error ?? "Couldn't upload receipt", true); return; }
    setReceiptUrl(j.url);
  }

  async function submit() {
    if (!amount || amount <= 0) { toast("Enter an amount", true); return; }
    if (!note.trim()) { toast("Add a short note", true); return; }
    if (category === "UNIT_EXPENSE" && !unitId) { toast("Pick a unit", true); return; }
    setSaving(true);
    const res = await fetch("/api/expense-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, unitId: category === "UNIT_EXPENSE" ? unitId : null, amount, date, note: capitalizeFirst(note.trim()), receiptUrl }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(j.error ?? "Couldn't submit request", true); return; }
    toast("Submitted for approval ✓");
    setAmount(null); setNote(""); setReceiptUrl(null); setUnitId(""); setDate(new Date().toISOString().slice(0, 10));
    setFileInputKey((k) => k + 1);
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-full bg-[var(--bg-2)] p-1 w-fit">
        {(["TIKTOK_ADS", "UNIT_EXPENSE", "PASA_GUEST", "OTHER"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold transition", category === c ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
          >
            {EXPENSE_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {category === "UNIT_EXPENSE" && (
          <div>
            <label className="field-label">Unit</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input mt-1.5">
              <option value="">Select a unit…</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.shortName}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="field-label">Amount (₱)</label>
          <input type="number" value={amount ?? ""} onChange={(e) => setAmount(e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 500" />
        </div>
        <div>
          <label className="field-label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Receipt (optional)</label>
          <input key={fileInputKey} type="file" accept="image/*" onChange={onReceiptChange} className="field-input mt-1.5" />
        </div>
      </div>
      <div>
        <label className="field-label">{category === "OTHER" ? "Reason" : "Note"}</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="field-input mt-1.5"
          placeholder={category === "OTHER" ? "e.g. describe what this expense was for" : "e.g. boosted post campaign, replacement pillows"}
        />
      </div>
      <button onClick={submit} disabled={saving} className="btn-primary">{saving ? "Submitting…" : "Submit for approval"}</button>
    </div>
  );
}

// Full-size receipt view — new receiptUrls are real hosted Blob URLs now,
// but this modal still matters for any pre-migration row still holding a
// raw base64 data: URL, since browsers won't reliably open a data: URL
// from a target="_blank" link (Chrome in particular just does nothing),
// which is why tapping the thumbnail previously looked broken. An in-page
// modal sidesteps that entirely regardless of which kind of URL it is.
function ReceiptViewerModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <Modal open onClose={onClose} title="Receipt">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Receipt" className="w-full rounded-xl object-contain" />
    </Modal>
  );
}

// Employee-facing list of their own submitted requests, with status badges
// and a rejection reason shown when relevant. Cancel only while PENDING.
function MyExpenseRequestsList({ requests, onChanged, readOnly }: { requests: ExpenseRequestRow[]; onChanged: () => void; readOnly?: boolean }) {
  const toast = useToast();
  const [viewing, setViewing] = useState<string | null>(null);

  async function cancel(id: string) {
    if (!confirm("Cancel this request?")) return;
    const res = await fetch(`/api/expense-requests/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't cancel", true); return; }
    toast("Cancelled");
    onChanged();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border-t border-[var(--line)] p-3.5 first:border-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13.5px] font-bold">{peso(r.amount)}</span>
              <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{EXPENSE_CATEGORY_LABEL[r.category] ?? r.category}</span>
              {r.unit && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{r.unit.shortName}</span>}
              <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide", EXPENSE_STATUS_BADGE[r.status])}>{r.status}</span>
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-[var(--gray)]">
              {fmtDate(r.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} · {r.note}
            </div>
            {r.status === "REJECTED" && r.rejectionReason && (
              <div className="mt-0.5 text-[11.5px] text-rausch">Reason: {r.rejectionReason}</div>
            )}
          </div>
          {r.receiptUrl && (
            <button type="button" onClick={() => setViewing(r.receiptUrl)} className="flex-none" title="View attached receipt">
              <img src={r.receiptUrl} alt="Receipt" className="h-10 w-10 flex-none rounded-lg border border-[var(--line)] object-cover hover:opacity-80" />
            </button>
          )}
          {r.status === "PENDING" && !readOnly && (
            <button onClick={() => cancel(r.id)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch" aria-label="Cancel">
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <ReceiptViewerModal url={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

// Owner-facing approval queue — every PENDING request across all employees.
// Approve is one click; Reject requires a short reason so the employee
// isn't left guessing.
function ExpenseApprovalsPanel({ requests, onChanged }: { requests: PendingRequestRow[]; onChanged: () => void }) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState<PendingRequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/expense-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    setBusyId(null);
    if (!res.ok) { toast("Couldn't approve", true); return; }
    toast("Approved ✓");
    onChanged();
  }

  async function reject() {
    if (!rejecting) return;
    if (!reason.trim()) { toast("Add a reason for the employee", true); return; }
    setBusyId(rejecting.id);
    const res = await fetch(`/api/expense-requests/${rejecting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED", rejectionReason: reason.trim() }),
    });
    setBusyId(null);
    if (!res.ok) { toast("Couldn't reject", true); return; }
    toast("Rejected");
    setRejecting(null);
    setReason("");
    onChanged();
  }

  if (requests.length === 0) {
    return <p className="text-[13px] text-[var(--gray)]">Nothing pending — all caught up. 🎉</p>;
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-t border-[var(--line)] p-3.5 first:border-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13.5px] font-bold">{peso(r.amount)}</span>
                <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{EXPENSE_CATEGORY_LABEL[r.category] ?? r.category}</span>
                {r.unit && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{r.unit.shortName}</span>}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-[var(--gray)]">
                {r.employee.name} · {ROLE_LABEL[r.employee.role] ?? r.employee.role} · {fmtDate(r.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} · {r.note}
              </div>
            </div>
            {r.receiptUrl && (
              <button type="button" onClick={() => setViewing(r.receiptUrl)} className="flex-none" title="View attached receipt">
                <img src={r.receiptUrl} alt="Receipt" className="h-12 w-12 flex-none rounded-lg border border-[var(--line)] object-cover hover:opacity-80" />
              </button>
            )}
            <div className="flex flex-none gap-1.5">
              <button onClick={() => approve(r.id)} disabled={busyId === r.id} className="btn btn-sm">Approve</button>
              <button onClick={() => { setRejecting(r); setReason(""); }} disabled={busyId === r.id} className="btn-ghost btn-sm">Reject</button>
            </div>
          </div>
        ))}
      </div>

      <ReceiptViewerModal url={viewing} onClose={() => setViewing(null)} />

      {rejecting && (
        <Modal
          open
          onClose={() => setRejecting(null)}
          title="Reject expense request"
          maxWidth={400}
          footer={<><button onClick={() => setRejecting(null)} className="btn-ghost">Cancel</button><button onClick={reject} disabled={busyId === rejecting.id} className="btn-primary ml-auto">Reject</button></>}
        >
          <div>
            <p className="mb-3 text-[13px] text-[var(--gray)]">{rejecting.employee.name}&rsquo;s {peso(rejecting.amount)} request — the reason below is shown to them.</p>
            <label className="field-label">Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="field-input mt-1.5" placeholder="e.g. missing receipt, duplicate of an existing entry" />
          </div>
        </Modal>
      )}
    </>
  );
}

const SALARY_TYPE_LABEL: Record<SalaryType, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };
const RATE_LABEL: Record<SalaryType, string> = { DAILY: "Rate per day (₱)", WEEKLY: "Rate per week (₱)", MONTHLY: "Rate per month (₱)" };

type RangeChoice = "this_week" | "last_week" | "this_month" | "last_month" | "custom";
const RANGE_LABEL: Record<RangeChoice, string> = { this_week: "This Week", last_week: "Last Week", this_month: "This Month", last_month: "Last Month", custom: "Custom Range" };
function rangeChoiceToParams(choice: RangeChoice, customStart: string, customEnd: string) {
  switch (choice) {
    case "this_week": return { rangeType: "weekly", offset: 0 };
    case "last_week": return { rangeType: "weekly", offset: -1 };
    case "this_month": return { rangeType: "monthly", offset: 0 };
    case "last_month": return { rangeType: "monthly", offset: -1 };
    case "custom": return { rangeType: "custom", offset: 0, start: customStart, end: customEnd };
  }
}

type OverviewRow = { id: string; name: string; role: string; teamKey: string | null; fixedSalary: number; successfulBookings: number; commissionPerBooking: number; commissionTotal: number; totalCleans: number; nightCleans: number; nightCleanBonus: number; totalPayroll: number };
type BookerRow = OverviewRow & { badge: string };
type TeamRow = { key: string; name: string; color: string; emoji: string; members: { id: string; name: string; role: string }[]; successfulBookings: number; revenue: number; totalPayroll: number; totalIncentives: number; occupancyContribution: number; rank: number; isTopTeam: boolean };
type OverviewData = {
  executiveSummary: { totalPayroll: number; totalIncentives: number; totalFixedSalary: number; totalHousekeepingBonus: number; totalBookingsClosed: number; activeEmployees: number };
  bookerPerformance: BookerRow[];
  housekeepingSummary: OverviewRow[];
  teams: TeamRow[];
};

/** This/Last Week/Month + custom-range filter, shared by every section on
 * the Owner View so switching it updates the Executive Summary, Booker
 * Performance, Housekeeping Summary, and Team Performance together. */
function RangeFilterBar({ choice, onChoice, customStart, customEnd, onCustomStart, onCustomEnd }: {
  choice: RangeChoice; onChoice: (c: RangeChoice) => void;
  customStart: string; customEnd: string; onCustomStart: (v: string) => void; onCustomEnd: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-[var(--bg-2)] p-1">
        {(["this_week", "last_week", "this_month", "last_month", "custom"] as const).map((c) => (
          <button
            key={c}
            onClick={() => onChoice(c)}
            className={cn("rounded-full px-3 py-1.5 text-[12.5px] font-bold transition", choice === c ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
          >
            {RANGE_LABEL[c]}
          </button>
        ))}
      </div>
      {choice === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={customStart} onChange={(e) => onCustomStart(e.target.value)} className="field-input !w-auto" />
          <span className="text-[12px] text-[var(--gray)]">to</span>
          <input type="date" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} className="field-input !w-auto" />
        </div>
      )}
    </div>
  );
}

// The Owner's landing view — Executive Summary, Booker Performance,
// Housekeeping Summary, and Team Performance (all range-filtered together),
// then the Staff & Salary editor and the expense-approval queue underneath.
function OwnerSummarySection({
  role, teamEmployees, onEmployeesChanged, pendingRequests, onRequestsChanged,
}: {
  role: string;
  teamEmployees: FullEmployee[];
  onEmployeesChanged: () => void;
  pendingRequests: PendingRequestRow[];
  onRequestsChanged: () => void;
}) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; role: string; salaryType: SalaryType; salaryRate: string }>({ name: "", role: "BOOKER", salaryType: "MONTHLY", salaryRate: "" });
  const [saving, setSaving] = useState(false);

  const periodStartIso = useMemo(() => manilaWeekRange(0).start.toISOString(), []);
  const monthStartIso = useMemo(() => manilaMonthStart().toISOString(), []);

  // Owners/Co-owners aren't staff paid a salary through this list — they
  // manage the business, not the other way around (same rule isPayrollRole
  // already applies to the Achievements panel below).
  const payrollEmployees = useMemo(() => teamEmployees.filter((e) => isPayrollRole(e.role)), [teamEmployees]);

  function periodFor(emp: FullEmployee) {
    return emp.salaryType === "MONTHLY"
      ? { periodStart: monthStartIso, amount: emp.monthlySalary, label: "this month" }
      : { periodStart: periodStartIso, amount: Math.round(weeklySalaryFor(emp.monthlySalary)), label: "this week" };
  }

  // ---- Executive Summary / Booker Performance / Housekeeping Summary /
  // Team Performance — one shared range filter driving all four. ----
  const [rangeChoice, setRangeChoice] = useState<RangeChoice>("this_week");
  const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  useEffect(() => {
    setOverviewLoading(true);
    const params = rangeChoiceToParams(rangeChoice, customStart, customEnd);
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    fetch(`/api/earnings/overview?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOverview(j))
      .catch(() => {})
      .finally(() => setOverviewLoading(false));
  }, [rangeChoice, customStart, customEnd]);

  function startEdit(e: FullEmployee) {
    setEditingId(e.id);
    setEditForm({ name: e.name, role: e.role, salaryType: e.salaryType, salaryRate: String(e.salaryRate ?? e.monthlySalary ?? 0) });
  }

  async function saveEdit(id: string) {
    const raw = editForm.salaryRate.trim();
    if (raw && (Number.isNaN(Number(raw)) || Number(raw) < 0)) { toast("Enter a valid salary rate", true); return; }
    setSaving(true);
    const res = await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name, role: editForm.role, salaryType: editForm.salaryType, salaryRate: Number(raw || 0) }),
    });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save", true); return; }
    toast("Saved ✓");
    setEditingId(null);
    onEmployeesChanged();
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-extrabold">Executive Summary</h2>
          <RangeFilterBar choice={rangeChoice} onChoice={setRangeChoice} customStart={customStart} customEnd={customEnd} onCustomStart={setCustomStart} onCustomEnd={setCustomEnd} />
        </div>
        {overviewLoading && !overview && <p className="text-[13px] text-[var(--gray)]">Loading…</p>}
        {overview && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total Payroll" value={peso(overview.executiveSummary.totalPayroll)} sub="fixed + incentives" />
            <StatCard label="Total Incentives" value={peso(overview.executiveSummary.totalIncentives)} sub="commission + bonuses" />
            <StatCard label="Total Fixed Salary" value={peso(overview.executiveSummary.totalFixedSalary)} sub="prorated to range" />
            <StatCard label="Housekeeping Bonus" value={peso(overview.executiveSummary.totalHousekeepingBonus)} sub="Night Clean Bonus total" />
            <StatCard label="Bookings Closed" value={String(overview.executiveSummary.totalBookingsClosed)} sub="completed stays" />
            <StatCard label="Active Employees" value={String(overview.executiveSummary.activeEmployees)} sub="on payroll" />
          </div>
        )}
      </div>

      {overview && (
        <div className="card overflow-hidden p-0">
          <div className="p-5 pb-3">
            <h2 className="text-[15px] font-extrabold">Booker Performance</h2>
            <p className="mt-0.5 text-[12px] text-[var(--gray)]">Sorted by successful bookings · top performer highlighted</p>
          </div>
          <div className="overflow-x-auto border-t border-[var(--line)]">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
                  <th className="py-2 pl-5 pr-3">Booker</th>
                  <th className="py-2 pr-3 text-right">Successful Bookings</th>
                  <th className="py-2 pr-3 text-right">Commission/Booking</th>
                  <th className="py-2 pr-3 text-right">Total Commission</th>
                  <th className="py-2 pr-3 text-right">Fixed Salary</th>
                  <th className="py-2 pr-3 text-right">Total Payroll</th>
                  <th className="py-2 pr-5">Badge</th>
                </tr>
              </thead>
              <tbody>
                {overview.bookerPerformance.length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-[13px] text-[var(--gray)]">No bookers on file.</td></tr>
                )}
                {overview.bookerPerformance.map((r, i) => (
                  <tr key={r.id} className={cn("border-b border-[var(--line)] last:border-0", i === 0 && r.successfulBookings > 0 && "bg-amber/5")}>
                    <td className="py-2.5 pl-5 pr-3 font-bold">{r.name}{r.teamKey && <span className="ml-1.5 text-[11px] font-semibold text-[var(--gray)]">{TEAMS[r.teamKey]?.emoji} {TEAMS[r.teamKey]?.name}</span>}</td>
                    <td className="py-2.5 pr-3 text-right font-bold">{r.successfulBookings}</td>
                    <td className="py-2.5 pr-3 text-right">{peso(r.commissionPerBooking)}</td>
                    <td className="py-2.5 pr-3 text-right">{peso(r.commissionTotal)}</td>
                    <td className="py-2.5 pr-3 text-right">{peso(r.fixedSalary)}</td>
                    <td className="py-2.5 pr-3 text-right font-extrabold">{peso(r.totalPayroll)}</td>
                    <td className="py-2.5 pr-5 text-[12px] font-bold">{r.badge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {overview && (
        <div className="card overflow-hidden p-0">
          <div className="p-5 pb-3">
            <h2 className="text-[15px] font-extrabold">Housekeeping Summary</h2>
            <p className="mt-0.5 text-[12px] text-[var(--gray)]">Actual completed cleaning records for the selected range</p>
          </div>
          <div className="overflow-x-auto border-t border-[var(--line)]">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">
                  <th className="py-2 pl-5 pr-3">Employee</th>
                  <th className="py-2 pr-3 text-right">Total Cleans</th>
                  <th className="py-2 pr-3 text-right">Night Cleans</th>
                  <th className="py-2 pr-3 text-right">Night Clean Bonus</th>
                  <th className="py-2 pr-3 text-right">Fixed Salary</th>
                  <th className="py-2 pr-5 text-right">Total Payroll</th>
                </tr>
              </thead>
              <tbody>
                {overview.housekeepingSummary.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-[13px] text-[var(--gray)]">No housekeeping staff on file.</td></tr>
                )}
                {overview.housekeepingSummary.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="py-2.5 pl-5 pr-3 font-bold">{r.name}{r.teamKey && <span className="ml-1.5 text-[11px] font-semibold text-[var(--gray)]">{TEAMS[r.teamKey]?.emoji} {TEAMS[r.teamKey]?.name}</span>}</td>
                    <td className="py-2.5 pr-3 text-right">{r.totalCleans}</td>
                    <td className="py-2.5 pr-3 text-right">{r.nightCleans}</td>
                    <td className="py-2.5 pr-3 text-right">{peso(r.nightCleanBonus)}</td>
                    <td className="py-2.5 pr-3 text-right">{peso(r.fixedSalary)}</td>
                    <td className="py-2.5 pr-5 text-right font-extrabold">{peso(r.totalPayroll)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {overview && <TeamPerformanceSection teams={overview.teams} />}

      <div className="card overflow-hidden p-0">
        <div className="p-5 pb-3">
          <h2 className="text-[15px] font-extrabold">Staff &amp; Salary</h2>
          <p className="mt-0.5 text-[12px] text-[var(--gray)]">{payrollEmployees.filter((e) => e.active).length} on staff · base salary settings</p>
          <p className="mt-1 text-[11.5px] text-[var(--gray)]">New staff are added from Admin &rarr; Users &amp; roles — booker, housekeeping, and auditor accounts show up here automatically.</p>
        </div>

        <div className="overflow-hidden border-t border-[var(--line)]">
          {payrollEmployees.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No staff on file yet.</p>}
          {payrollEmployees.map((emp) => {
            const { amount, label } = periodFor(emp);
            const isEditing = editingId === emp.id;
            return (
              <div key={emp.id} className="border-t border-[var(--line)] first:border-0">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold">{emp.name}{!emp.active && <span className="ml-1.5 text-[11px] font-semibold text-[var(--gray)]">(inactive)</span>}</div>
                    <div className="text-[12px] text-[var(--gray)]">{ROLE_LABEL[emp.role] ?? emp.role} · {SALARY_TYPE_LABEL[emp.salaryType]} ₱{emp.salaryRate}</div>
                  </div>
                  <div className="flex-none text-right">
                    <div className="text-[15px] font-extrabold">{peso(amount)}</div>
                    <div className="text-[11px] text-[var(--gray)]">{label}</div>
                  </div>
                  <button onClick={() => (isEditing ? setEditingId(null) : startEdit(emp))} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--gray)] hover:border-rausch hover:text-rausch" aria-label="Edit">
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", isEditing && "rotate-180")} />
                </div>
                {isEditing && (
                  <div className="space-y-2.5 border-t border-[var(--line)] bg-[var(--bg-2)] p-4">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="field-label">Name</label>
                        <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="field-input mt-1.5" />
                      </div>
                      <div>
                        <label className="field-label">Role</label>
                        <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} className="field-input mt-1.5">
                          {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Salary type</label>
                      <div className="mt-1.5 inline-flex gap-1 rounded-full bg-[var(--card)] p-1">
                        {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setEditForm((f) => ({ ...f, salaryType: t }))}
                            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold transition", editForm.salaryType === t ? "bg-[var(--bg-2)] shadow-s" : "text-[var(--gray)]")}
                          >
                            {SALARY_TYPE_LABEL[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="field-label">{RATE_LABEL[editForm.salaryType]}</label>
                        <input type="number" min={0} value={editForm.salaryRate} onChange={(e) => setEditForm((f) => ({ ...f, salaryRate: e.target.value }))} className="field-input mt-1.5" />
                      </div>
                      <div>
                        <label className="field-label">≈ Monthly equivalent</label>
                        <div className="field-input mt-1.5 flex items-center bg-[var(--card)] font-bold text-[var(--gray)]">
                          {peso(monthlySalaryFromRate(editForm.salaryType, Number(editForm.salaryRate) || 0))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => saveEdit(emp.id)} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
                      <button onClick={() => setEditingId(null)} className="btn-ghost">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Expense approvals</h2>
          <span className="text-[12px] font-semibold text-[var(--gray)]">{pendingRequests.length} pending</span>
        </div>
        <ExpenseApprovalsPanel requests={pendingRequests} onChanged={onRequestsChanged} />
      </div>

      <div className="card p-5">
        <h2 className="text-[15px] font-extrabold">Achievements & Rewards</h2>
        <p className="mt-0.5 mb-3 text-[12px] text-[var(--gray)]">Set what unlocks a badge, the ₱ reward, and a personal message shown once they hit it.</p>
        <AchievementsRewardsPanel employees={teamEmployees.filter((e) => isPayrollRole(e.role))} />
      </div>
    </div>
  );
}

/**
 * Team A/B/C performance — real collaborative earning groups (Employee.
 * teamKey), not the old role-based Booking/Housekeeping/Operations display
 * split (TeamsSection.tsx, still shown as-is on the Individual View below).
 * Ranked by successful bookings, then revenue, then occupancy contribution
 * — same order the API already sorted them in, so `rank`/`isTopTeam` here
 * are just read off the response, never recomputed client-side.
 */
function TeamPerformanceSection({ teams }: { teams: TeamRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Team Performance</h2>
        <span className="text-[12px] font-semibold text-[var(--gray)]">ranked by bookings → revenue → occupancy</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {teams.map((t) => {
          const isOpen = expanded === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setExpanded(isOpen ? null : t.key)}
              className={cn("rounded-2xl border p-4 text-left transition", t.isTopTeam ? "border-amber/40 bg-amber/5" : "border-[var(--line)]")}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-extrabold">{t.emoji} {t.name}</span>
                <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-[var(--gray)]" style={{ background: `${t.color}22`, color: t.color }}>#{t.rank}</span>
              </div>
              {t.isTopTeam && <div className="mt-1 text-[11px] font-extrabold text-amber">🏆 Team of the Week</div>}
              <div className="mt-2 flex -space-x-2">
                {t.members.map((m) => (
                  <span key={m.id} title={m.name} className="grid h-7 w-7 place-items-center rounded-full text-[10.5px] font-bold text-white ring-2 ring-[var(--card)]" style={{ background: t.color }}>
                    {initials(m.name)}
                  </span>
                ))}
                {t.members.length === 0 && <span className="text-[11.5px] text-[var(--gray)]">No members assigned</span>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div><div className="font-extrabold">{t.successfulBookings}</div><div className="text-[var(--gray)]">bookings</div></div>
                <div><div className="font-extrabold">{peso(t.revenue)}</div><div className="text-[var(--gray)]">revenue</div></div>
                <div><div className="font-extrabold">{peso(t.totalPayroll)}</div><div className="text-[var(--gray)]">payroll</div></div>
                <div><div className="font-extrabold">{t.occupancyContribution}%</div><div className="text-[var(--gray)]">occupancy</div></div>
              </div>
              {isOpen && (
                <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                  {t.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[12px]">
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-[var(--gray)]">{ROLE_LABEL[m.role] ?? m.role}</span>
                    </div>
                  ))}
                  <div className="text-[11px] text-[var(--gray)]">Total incentives: {peso(t.totalIncentives)}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const NEW_ACHIEVEMENT = { label: "", threshold: "", rewardAmount: "", personalMessage: "" };

function AchievementsRewardsPanel({ employees }: { employees: FullEmployee[] }) {
  const toast = useToast();
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id ?? "");
  const [achievements, setAchievements] = useState<AchievementDefRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(NEW_ACHIEVEMENT);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load(empId: string) {
    if (!empId) { setAchievements([]); return; }
    setLoading(true);
    const res = await fetch(`/api/employee-achievements?employeeId=${empId}`);
    setAchievements(res.ok ? await res.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    load(selectedEmpId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpId]);

  function startEdit(a: AchievementDefRow) {
    setEditingId(a.id);
    setAdding(false);
    setForm({ label: a.label, threshold: String(a.threshold), rewardAmount: String(a.rewardAmount), personalMessage: a.personalMessage ?? "" });
  }

  function validate() {
    if (!form.label.trim()) { toast("Enter a badge name", true); return false; }
    if (!form.threshold || Number.isNaN(Number(form.threshold)) || Number(form.threshold) <= 0) { toast("Enter how many completed bookings/cleanings unlock it", true); return false; }
    if (form.rewardAmount && (Number.isNaN(Number(form.rewardAmount)) || Number(form.rewardAmount) < 0)) { toast("Enter a valid reward amount", true); return false; }
    return true;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    const payload = { label: form.label.trim(), threshold: Number(form.threshold), rewardAmount: Number(form.rewardAmount || 0), personalMessage: form.personalMessage.trim() || null };
    const res = editingId
      ? await fetch(`/api/employee-achievements/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/employee-achievements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, employeeId: selectedEmpId }) });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save", true); return; }
    toast(editingId ? "Updated ✓" : "Added ✓");
    setEditingId(null);
    setAdding(false);
    setForm(NEW_ACHIEVEMENT);
    load(selectedEmpId);
  }

  async function remove(id: string) {
    if (!confirm("Remove this achievement?")) return;
    await fetch(`/api/employee-achievements/${id}`, { method: "DELETE" });
    if (editingId === id) { setEditingId(null); setForm(NEW_ACHIEVEMENT); }
    load(selectedEmpId);
  }

  return (
    <div>
      <select
        value={selectedEmpId}
        onChange={(e) => { setSelectedEmpId(e.target.value); setEditingId(null); setAdding(false); setForm(NEW_ACHIEVEMENT); }}
        className="field-input mb-3 w-auto"
      >
        {employees.length === 0 && <option value="">No payroll staff yet</option>}
        {employees.map((e) => <option key={e.id} value={e.id}>{e.name} · {ROLE_LABEL[e.role] ?? e.role}</option>)}
      </select>

      {loading && <p className="text-[13px] text-[var(--gray)]">Loading…</p>}

      {!loading && (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          {achievements.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No achievements set for this person yet.</p>}
          {achievements.map((a) => (
            <div key={a.id} className="border-t border-[var(--line)] first:border-0">
              <div className="flex flex-wrap items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{a.label}</div>
                  <div className="text-[11.5px] text-[var(--gray)]">
                    unlock at {a.threshold} · {a.rewardAmount > 0 ? peso(a.rewardAmount) : "no ₱ reward"}{a.personalMessage ? ` · "${a.personalMessage}"` : ""}
                  </div>
                </div>
                <button onClick={() => startEdit(a)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]" aria-label="Edit"><EditIcon className="h-4 w-4" /></button>
                <button onClick={() => remove(a.id)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch" aria-label="Remove"><TrashIcon className="h-4 w-4" /></button>
              </div>
              {editingId === a.id && (
                <AchievementForm form={form} setForm={setForm} onSave={save} onCancel={() => { setEditingId(null); setForm(NEW_ACHIEVEMENT); }} saving={saving} />
              )}
            </div>
          ))}
        </div>
      )}

      {!adding && !editingId && selectedEmpId && (
        <button onClick={() => { setAdding(true); setForm(NEW_ACHIEVEMENT); }} className="btn btn-sm mt-3">
          <PlusIcon className="h-3.5 w-3.5" /> Add achievement
        </button>
      )}
      {adding && (
        <div className="mt-3 rounded-2xl border border-[var(--line)] p-3.5">
          <AchievementForm form={form} setForm={setForm} onSave={save} onCancel={() => { setAdding(false); setForm(NEW_ACHIEVEMENT); }} saving={saving} />
        </div>
      )}
    </div>
  );
}

function AchievementForm({
  form, setForm, onSave, onCancel, saving,
}: {
  form: typeof NEW_ACHIEVEMENT;
  setForm: (f: typeof NEW_ACHIEVEMENT) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2.5 border-t border-[var(--line)] bg-[var(--bg-2)] p-3.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="field-label">Badge name</label>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="field-input mt-1.5" placeholder="e.g. 50 Bookings" />
        </div>
        <div>
          <label className="field-label">Unlock at (completed bookings/cleanings)</label>
          <input type="number" min={1} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="field-input mt-1.5" placeholder="e.g. 50" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label className="field-label">Reward (₱, optional)</label>
          <input type="number" min={0} value={form.rewardAmount} onChange={(e) => setForm({ ...form, rewardAmount: e.target.value })} className="field-input mt-1.5" placeholder="e.g. 500" />
        </div>
        <div>
          <label className="field-label">Personal message (optional)</label>
          <input value={form.personalMessage} onChange={(e) => setForm({ ...form, personalMessage: e.target.value })} className="field-input mt-1.5" placeholder="shown once they unlock it" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onSave} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
