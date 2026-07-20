"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { StatCard } from "@/components/ui/StatCard";
import { Accordion } from "@/components/ui/Accordion";
import { PageLoading } from "@/components/ui/PageLoading";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDate, manilaWeekRange } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { FilePdfIcon, PlusIcon, TrashIcon, EditIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { fileToDataUrl } from "@/lib/file";
import { monthlySalaryFromRate, weeklySalaryFor, isPayrollRole, type SalaryType } from "@/lib/payroll";
import { WorldMapProgress, EliteBadgeButton, AchievementBadgeCard } from "@/components/earnings/WorldMapProgress";

type EmployeeLite = { id: string; name: string; role: string };
type UnitLite = { id: string; name: string; shortName: string };
type ExpenseRequestRow = {
  id: string; category: string; amount: number; note: string; date: string; status: string;
  rejectionReason: string | null; unit: UnitLite | null;
};
type PendingRequestRow = ExpenseRequestRow & { employee: { id: string; name: string; role: string } };
type FullEmployee = { id: string; name: string; role: string; monthlySalary: number; salaryType: SalaryType; salaryRate: number; active: boolean };
type PayrollPaymentRow = { id: string; employeeId: string; amount: number; status: string; givenAt: string | null; markedBy: { id: string; name: string } | null };
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
  metric: "bookings" | "cleaningDays";
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
type EarningsData = {
  employee: { id: string; name: string; role: string; salaryType: string; salaryRate: number; monthlySalary: number };
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
};
type LeaderboardRow = { employeeId: string; name: string; completedThisMonth: number; commissionThisMonth: number; bonusThisMonth: number };
type LeaderboardMetric = "bookings" | "cleaningDays";
type LeaderboardData =
  | { scope: "all"; metric: LeaderboardMetric; leaderboard: LeaderboardRow[] }
  | { scope: "own"; metric: LeaderboardMetric; rank: number | null; total: number; own: LeaderboardRow | null };
const LEADERBOARD_LABELS: Record<LeaderboardMetric, { person: string; personPlural: string; activity: string; activityPlural: string }> = {
  bookings: { person: "booker", personPlural: "bookers", activity: "booking", activityPlural: "bookings" },
  cleaningDays: { person: "cleaner", personPlural: "cleaners", activity: "cleaning day", activityPlural: "cleaning days" },
};

export function EarningsView({
  role, isAdminViewer, ownEmployeeId, employees,
}: {
  role: string;
  isAdminViewer: boolean;
  ownEmployeeId: string | null;
  employees: EmployeeLite[];
}) {
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

  async function load() {
    if (selectedEmployeeId === OWNER_SUMMARY_VALUE) return;
    setLoading(true);
    setError(false);
    try {
      const params = selectedEmployeeId ? `?employeeId=${selectedEmployeeId}` : "";
      const res = await fetch(`/api/my-earnings${params}`);
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
  }, [selectedEmployeeId]);

  useEffect(() => {
    // Admin viewers see the board for whichever employee is currently
    // selected (Booker or Housekeeping); a non-admin viewer's own board is
    // inferred server-side from their own Employee record regardless of
    // this param, so it's only meaningful for the admin case.
    if (isOwnerSummary || !data?.employee) return;
    const roleParam = isAdminViewer && data.employee.role === "HOUSEKEEPING" ? "?role=HOUSEKEEPING" : "";
    fetch(`/api/leaderboard${roleParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setLeaderboard(j))
      .catch(() => {});
  }, [isOwnerSummary, isAdminViewer, data?.employee?.id, data?.employee?.role]);

  // Owner-only: the Owner Summary view's data (team salary, pending-approvals
  // queue, this week's payroll-given status) is company-wide, independent of
  // the per-employee earnings fetch above — loaded once, refreshed on demand.
  const [teamEmployees, setTeamEmployees] = useState<FullEmployee[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  const [payrollPayments, setPayrollPayments] = useState<PayrollPaymentRow[]>([]);
  async function refreshTeamEmployees() {
    const res = await fetch("/api/employees");
    if (res.ok) setTeamEmployees(await res.json());
  }
  async function refreshPendingRequests() {
    const res = await fetch("/api/expense-requests?status=PENDING");
    if (res.ok) setPendingRequests(await res.json());
  }
  async function refreshPayrollPayments() {
    const res = await fetch("/api/payroll-payments");
    if (res.ok) setPayrollPayments(await res.json());
  }
  useEffect(() => {
    if (!isAdminViewer) return;
    refreshTeamEmployees();
    refreshPendingRequests();
    refreshPayrollPayments();
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

  function exportPDF() {
    if (!data) return;
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
    doc.text("Evangelina's Staycation", 14, 18);
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
          teamEmployees={teamEmployees}
          onEmployeesChanged={refreshTeamEmployees}
          pendingRequests={pendingRequests}
          onRequestsChanged={refreshPendingRequests}
          payrollPayments={payrollPayments}
          onPayrollChanged={refreshPayrollPayments}
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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Pending payroll" value={peso(data.pendingPayroll)} sub="salary + activity, this week" />
        <StatCard label="Upcoming payroll date" value={fmtDate(data.upcomingPayrollDate, { month: "short", day: "numeric", timeZone: "Asia/Manila" })} />
        <StatCard label="Gross salary" value={peso(data.grossThisMonth)} sub="this month" />
        <StatCard label="Net salary" value={peso(data.netThisMonth)} sub="this month" />
        <StatCard label="Base salary" value={peso(data.employee.monthlySalary)} sub="monthly equivalent" />
        <StatCard label="Commission/incentives" value={peso(data.thisWeek.total)} sub="activity this week" />
        <StatCard label="Bonuses" value={peso(data.bonusAwards.reduce((s, a) => s + a.amount, 0))} sub="lifetime, all units" />
        <StatCard label="Lifetime earnings" value={peso(data.lifetimeEarnings)} sub="estimated, all-time" />
      </div>

      <Accordion title="How this is calculated" sub={data.thisWeek.subtitle || undefined}>
        <div className="space-y-2">
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
      </Accordion>

      {data.eliteChallenge && <EliteChallengeQuest challenge={data.eliteChallenge} employeeId={data.employee.id} />}

      {(data.employee.role === "BOOKER" || data.employee.role === "HOUSEKEEPING") && (
        <Accordion title="Achievements">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.achievements.map((a, i) => <AchievementBadgeCard key={a.id} a={a} index={i} />)}
          </div>
        </Accordion>
      )}

      <Accordion title="Payroll history" sub="last 12 weeks">
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

      {!isAdminViewer && data.expenseRequests.length > 0 && (
        <Accordion title="My expense requests" sub={`${data.expenseRequests.length} submitted`}>
          <MyExpenseRequestsList requests={data.expenseRequests} onChanged={load} />
        </Accordion>
      )}

      {(() => {
        const l = LEADERBOARD_LABELS[leaderboard?.metric ?? "bookings"];
        return (
          <Accordion title="Leaderboard" sub={leaderboard?.scope === "all" ? `top ${l.personPlural}, this month` : "your ranking"}>
            {!leaderboard && <p className="text-[13px] text-[var(--gray)]">Loading…</p>}
            {leaderboard?.scope === "all" && (
              <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
                {leaderboard.leaderboard.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No {l.personPlural} on file.</p>}
                {leaderboard.leaderboard.map((r, i) => (
                  <div key={r.employeeId} className="flex items-center gap-3 border-t border-[var(--line)] p-3.5 first:border-0">
                    <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-extrabold", i === 0 ? "bg-amber text-white" : "bg-[var(--bg-2)] text-[var(--gray)]")}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold">{r.name}</div>
                      <div className="text-[11.5px] text-[var(--gray)]">{r.completedThisMonth} {r.completedThisMonth === 1 ? l.activity : l.activityPlural} this month</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-bold">{peso(r.commissionThisMonth + r.bonusThisMonth)}</div>
                      <div className="text-[11px] text-[var(--gray)]">commission + bonus</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {leaderboard?.scope === "own" && (
              <div className="rounded-2xl border border-[var(--line)] p-5 text-center">
                {leaderboard.rank ? (
                  <>
                    <div className="text-3xl font-extrabold text-rausch">#{leaderboard.rank}</div>
                    <p className="mt-1 text-[13px] text-[var(--gray)]">out of {leaderboard.total} {leaderboard.total === 1 ? l.person : l.personPlural} this month</p>
                    {leaderboard.own && <p className="mt-2 text-[13px] font-semibold">{leaderboard.own.completedThisMonth} completed {leaderboard.own.completedThisMonth === 1 ? l.activity : l.activityPlural}</p>}
                  </>
                ) : (
                  <p className="text-[13px] text-[var(--gray)]">Not ranked yet — no completed {l.activityPlural} this month.</p>
                )}
              </div>
            )}
          </Accordion>
        );
      })()}
    </div>
  );
}

// An original fantasy-kingdom "world map" skin over the Elite Booker
// Challenge data (see WorldMapProgress.tsx) — same numbers as before,
// presented as a journey through seven original waypoints instead of a
// plain stat card. No licensed art/characters/music of any kind.
function EliteChallengeQuest({ challenge, employeeId }: { challenge: EliteChallenge; employeeId: string }) {
  const isCleaning = challenge.metric === "cleaningDays";
  return (
    <Accordion title={`Monthly Elite ${isCleaning ? "Housekeeper" : "Booker"} Challenge`} sub="resets on the 1st of every month">
      <div className="mb-4">
        <WorldMapProgress challenge={challenge} employeeId={employeeId} />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
        {challenge.tiers.map((t, i) => <EliteBadgeButton key={t.tier} tier={t} index={i} metric={challenge.metric} />)}
      </div>
    </Accordion>
  );
}

const EXPENSE_CATEGORY_LABEL: Record<string, string> = { TIKTOK_ADS: "TikTok Ads", UNIT_EXPENSE: "Unit Expense" };

// Employee-facing submission form — TikTok Ads (company-wide) or Unit
// Expense (requires picking which unit). Submits PENDING; never affects
// Realized/Forecast profit or payroll until an Owner/Admin approves it.
function ExpenseSubmitForm({ units, onSubmitted }: { units: UnitLite[]; onSubmitted: () => void }) {
  const toast = useToast();
  const [category, setCategory] = useState<"TIKTOK_ADS" | "UNIT_EXPENSE">("TIKTOK_ADS");
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptUrl(await fileToDataUrl(file));
  }

  async function submit() {
    if (!amount || amount <= 0) { toast("Enter an amount", true); return; }
    if (!note.trim()) { toast("Add a short note", true); return; }
    if (category === "UNIT_EXPENSE" && !unitId) { toast("Pick a unit", true); return; }
    setSaving(true);
    const res = await fetch("/api/expense-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, unitId: category === "UNIT_EXPENSE" ? unitId : null, amount, date, note: note.trim(), receiptUrl }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(j.error ?? "Couldn't submit request", true); return; }
    toast("Submitted for approval ✓");
    setAmount(null); setNote(""); setReceiptUrl(null); setUnitId("");
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-full bg-[var(--bg-2)] p-1 w-fit">
        {(["TIKTOK_ADS", "UNIT_EXPENSE"] as const).map((c) => (
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
          <input type="file" accept="image/*" onChange={onReceiptChange} className="field-input mt-1.5" />
        </div>
      </div>
      <div>
        <label className="field-label">Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input mt-1.5" placeholder="e.g. boosted post campaign, replacement pillows" />
      </div>
      <button onClick={submit} disabled={saving} className="btn-primary">{saving ? "Submitting…" : "Submit for approval"}</button>
    </div>
  );
}

// Employee-facing list of their own submitted requests, with status badges
// and a rejection reason shown when relevant. Cancel only while PENDING.
function MyExpenseRequestsList({ requests, onChanged }: { requests: ExpenseRequestRow[]; onChanged: () => void }) {
  const toast = useToast();

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
          {r.status === "PENDING" && (
            <button onClick={() => cancel(r.id)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch" aria-label="Cancel">
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
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
            <div className="flex flex-none gap-1.5">
              <button onClick={() => approve(r.id)} disabled={busyId === r.id} className="btn btn-sm">Approve</button>
              <button onClick={() => { setRejecting(r); setReason(""); }} disabled={busyId === r.id} className="btn-ghost btn-sm">Reject</button>
            </div>
          </div>
        ))}
      </div>

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
const PAYROLL_STATUS_BADGE: Record<string, string> = { PENDING: "bg-amber/15 text-amber", GIVEN: "bg-green/15 text-green" };
const NEW_ROW = { id: "", name: "", role: "BOOKER", salaryType: "MONTHLY" as SalaryType, salaryRate: "" };

// The Owner's landing view — one compact table (status + summary + edit, all
// in one place instead of stacked separately) plus the expense-approval
// queue right underneath, so both halves of "review and approve" live
// together.
function OwnerSummarySection({
  teamEmployees, onEmployeesChanged, pendingRequests, onRequestsChanged, payrollPayments, onPayrollChanged,
}: {
  teamEmployees: FullEmployee[];
  onEmployeesChanged: () => void;
  pendingRequests: PendingRequestRow[];
  onRequestsChanged: () => void;
  payrollPayments: PayrollPaymentRow[];
  onPayrollChanged: () => void;
}) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; role: string; salaryType: SalaryType; salaryRate: string }>({ name: "", role: "BOOKER", salaryType: "MONTHLY", salaryRate: "" });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(NEW_ROW);
  const [saving, setSaving] = useState(false);
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);

  const periodStartIso = useMemo(() => manilaWeekRange(0).start.toISOString(), []);
  const paymentByEmployee = useMemo(() => new Map(payrollPayments.map((p) => [p.employeeId, p])), [payrollPayments]);

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

  async function deactivate(id: string) {
    if (!confirm("Remove this person from staff? They'll stop appearing in Booker/Cleaner/Received-by menus.")) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    onEmployeesChanged();
  }

  async function addPerson() {
    if (!addForm.name.trim()) { toast("Enter a name", true); return; }
    const raw = addForm.salaryRate.trim();
    if (!raw || Number.isNaN(Number(raw)) || Number(raw) <= 0) { toast("Enter a valid salary rate", true); return; }
    setSaving(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name, role: addForm.role, salaryType: addForm.salaryType, salaryRate: Number(raw) }),
    });
    setSaving(false);
    if (!res.ok) { toast("Couldn't add person", true); return; }
    toast("Added ✓");
    setAdding(false);
    setAddForm(NEW_ROW);
    onEmployeesChanged();
  }

  async function togglePayroll(emp: FullEmployee, nextStatus: "PENDING" | "GIVEN") {
    setBusyPaymentId(emp.id);
    const weeklyAmount = Math.round(weeklySalaryFor(emp.monthlySalary));
    const res = await fetch("/api/payroll-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: emp.id, periodStart: periodStartIso, amount: weeklyAmount, status: nextStatus }),
    });
    setBusyPaymentId(null);
    if (!res.ok) { toast("Couldn't update payroll status", true); return; }
    toast(nextStatus === "GIVEN" ? "Marked as given ✓" : "Marked as pending");
    onPayrollChanged();
  }

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between p-5 pb-3">
          <div>
            <h2 className="text-[15px] font-extrabold">Team salary</h2>
            <p className="mt-0.5 text-[12px] text-[var(--gray)]">{teamEmployees.filter((e) => e.active).length} on staff · this week&rsquo;s payroll status</p>
          </div>
          <button onClick={() => setAdding((v) => !v)} className="btn btn-sm">
            <PlusIcon className="h-3.5 w-3.5" /> Add person
          </button>
        </div>

        {adding && (
          <div className="mx-5 mb-3 rounded-2xl border border-[var(--line)] p-3.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <label className="field-label">Name</label>
                <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="field-input mt-1.5" placeholder="Full name" />
              </div>
              <div className="min-w-[140px] flex-1">
                <label className="field-label">Role</label>
                <select value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))} className="field-input mt-1.5">
                  {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="min-w-[120px]">
                <label className="field-label">Type</label>
                <select value={addForm.salaryType} onChange={(e) => setAddForm((f) => ({ ...f, salaryType: e.target.value as SalaryType }))} className="field-input mt-1.5">
                  {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((t) => <option key={t} value={t}>{SALARY_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="min-w-[120px]">
                <label className="field-label">{RATE_LABEL[addForm.salaryType]}</label>
                <input type="number" min={0} value={addForm.salaryRate} onChange={(e) => setAddForm((f) => ({ ...f, salaryRate: e.target.value }))} className="field-input mt-1.5" placeholder="e.g. 15000" />
              </div>
              <button onClick={addPerson} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Add"}</button>
              <button onClick={() => { setAdding(false); setAddForm(NEW_ROW); }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        <div className="overflow-hidden border-t border-[var(--line)]">
          {teamEmployees.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No staff on file yet.</p>}
          {teamEmployees.map((emp) => {
            const eligible = isPayrollRole(emp.role);
            const payment = paymentByEmployee.get(emp.id);
            const status = payment?.status ?? "PENDING";
            const weeklyAmount = payment?.amount ?? Math.round(weeklySalaryFor(emp.monthlySalary));
            const isEditing = editingId === emp.id;
            return (
              <div key={emp.id} className="border-t border-[var(--line)] first:border-0">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold">{emp.name}{!emp.active && <span className="ml-1.5 text-[11px] font-semibold text-[var(--gray)]">(inactive)</span>}</div>
                    <div className="text-[12px] text-[var(--gray)]">{ROLE_LABEL[emp.role] ?? emp.role} · {SALARY_TYPE_LABEL[emp.salaryType]} ₱{emp.salaryRate}</div>
                  </div>
                  {eligible && (
                    <div className="flex-none text-right">
                      <div className="text-[15px] font-extrabold">{peso(weeklyAmount)}</div>
                      <div className="text-[11px] text-[var(--gray)]">this week</div>
                    </div>
                  )}
                  {eligible && (
                    <span className={cn("flex-none rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide", PAYROLL_STATUS_BADGE[status])}>{status}</span>
                  )}
                  {eligible && (
                    <button
                      onClick={() => togglePayroll(emp, status === "GIVEN" ? "PENDING" : "GIVEN")}
                      disabled={busyPaymentId === emp.id}
                      className="btn-sm btn flex-none"
                    >
                      {status === "GIVEN" ? "Mark pending" : "Mark given"}
                    </button>
                  )}
                  <button onClick={() => (isEditing ? setEditingId(null) : startEdit(emp))} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--gray)] hover:border-rausch hover:text-rausch" aria-label="Edit">
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => deactivate(emp.id)} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--gray)] hover:border-rausch hover:text-rausch" aria-label="Remove">
                    <TrashIcon className="h-4 w-4" />
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
