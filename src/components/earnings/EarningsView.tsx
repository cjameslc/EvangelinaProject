"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { StatCard } from "@/components/ui/StatCard";
import { Accordion } from "@/components/ui/Accordion";
import { PageLoading } from "@/components/ui/PageLoading";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { FilePdfIcon, PlusIcon, TrashIcon } from "@/components/ui/Icons";
import { fileToDataUrl } from "@/lib/file";
import { StaffTab } from "@/components/admin/StaffTab";

type EmployeeLite = { id: string; name: string; role: string };
type UnitLite = { id: string; name: string; shortName: string };
type ExpenseRequestRow = {
  id: string; category: string; amount: number; note: string; date: string; status: string;
  rejectionReason: string | null; unit: UnitLite | null;
};
type PendingRequestRow = ExpenseRequestRow & { employee: { id: string; name: string; role: string } };
type FullEmployee = { id: string; name: string; role: string; monthlySalary: number; salaryType: "DAILY" | "WEEKLY" | "MONTHLY"; salaryRate: number; active: boolean };

const EXPENSE_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber/15 text-amber",
  APPROVED: "bg-green/15 text-green",
  REJECTED: "bg-rausch/15 text-rausch",
};
type TeamLineItem = { label: string; detail: string; amount: number; deduction?: boolean };
type EliteTierStatus = { tier: number; amount: number; stars: number; badge: string; medal: string; slotsTotal: number; slotsTaken: number; wonByMe: boolean };
type EliteChallenge = {
  completedThisMonth: number; rank: number; totalBookers: number;
  currentTier: number | null; currentStars: number; currentBadge: string | null;
  nextTier: number | null; nextTierAmount: number | null; remaining: number; progressPct: number;
  slotsRemainingForNextTier: number; slotsTotalForNextTier: number;
  estimatedCommission: number; potentialBonus: number; tiers: EliteTierStatus[];
};
type Achievement = { id: string; label: string; unlocked: boolean };
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
type LeaderboardData =
  | { scope: "all"; leaderboard: LeaderboardRow[] }
  | { scope: "own"; rank: number | null; total: number; own: LeaderboardRow | null };

export function EarningsView({
  role, isAdminViewer, ownEmployeeId, employees,
}: {
  role: string;
  isAdminViewer: boolean;
  ownEmployeeId: string | null;
  employees: EmployeeLite[];
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(ownEmployeeId ?? employees[0]?.id ?? null);
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [historySearch, setHistorySearch] = useState("");

  async function load() {
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
    fetch("/api/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setLeaderboard(j))
      .catch(() => {});
  }, []);

  // Owner-only: the full team-salary editor and the pending-approvals queue
  // are company-wide, independent of whichever employee is selected in the
  // picker above — fetched once, refreshed on demand.
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
          {isAdminViewer && employees.length > 0 && (
            <select value={selectedEmployeeId ?? ""} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="field-input w-auto">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} · {ROLE_LABEL[e.role] ?? e.role}</option>
              ))}
            </select>
          )}
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

      {isAdminViewer && (
        <Accordion title="Team salary" sub={`${teamEmployees.filter((e) => e.active).length} on staff`}>
          <StaffTab employees={teamEmployees} onChanged={refreshTeamEmployees} />
        </Accordion>
      )}

      {isAdminViewer && (
        <Accordion title="Expense approvals" sub={`${pendingRequests.length} pending`}>
          <ExpenseApprovalsPanel requests={pendingRequests} onChanged={refreshPendingRequests} />
        </Accordion>
      )}

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

      {data.eliteChallenge && (
        <Accordion title="Monthly Elite Booker Challenge" sub="resets on the 1st of every month">
          <div className="mb-4 rounded-2xl border border-[var(--line)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[18px] font-extrabold">
                  {data.eliteChallenge.currentBadge ? `${"⭐".repeat(data.eliteChallenge.currentStars)} ${data.eliteChallenge.currentBadge}` : "No tier yet this month"}
                </div>
                <div className="mt-0.5 text-[13px] text-[var(--gray)]">
                  {data.eliteChallenge.completedThisMonth}{data.eliteChallenge.nextTier ? ` / ${data.eliteChallenge.nextTier}` : ""} bookings this month
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-bold">Rank #{data.eliteChallenge.rank} of {data.eliteChallenge.totalBookers}</div>
                <div className="text-[11.5px] text-[var(--gray)]">this month</div>
              </div>
            </div>

            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--bg-2)]">
              <div className="h-full rounded-full bg-rausch transition-all" style={{ width: `${data.eliteChallenge.progressPct}%` }} />
            </div>

            {data.eliteChallenge.nextTier ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[var(--gray)]">
                  Only <b className="text-[var(--ink)]">{data.eliteChallenge.remaining} more booking{data.eliteChallenge.remaining === 1 ? "" : "s"}</b> to unlock 💰 {peso(data.eliteChallenge.nextTierAmount ?? 0)}
                </p>
                <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-extrabold", data.eliteChallenge.slotsRemainingForNextTier > 0 ? "bg-teal/15 text-teal" : "bg-rausch/15 text-rausch")}>
                  Reward Slots: {data.eliteChallenge.slotsRemainingForNextTier} of {data.eliteChallenge.slotsTotalForNextTier} Remaining
                </span>
              </div>
            ) : (
              <p className="mt-3 text-[13px] font-semibold text-green">👑 Maximum tier reached this month!</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-bold uppercase text-[var(--gray)]">Estimated commission</div>
                <div className="text-[15px] font-extrabold">{peso(data.eliteChallenge.estimatedCommission)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase text-[var(--gray)]">Potential bonus</div>
                <div className="text-[15px] font-extrabold">{peso(data.eliteChallenge.potentialBonus)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
            {data.eliteChallenge.tiers.map((t) => (
              <div key={t.tier} className={cn("rounded-xl border p-3 text-center", t.wonByMe ? "border-rausch/30 bg-rausch/5" : "border-[var(--line)]")}>
                <div className="text-lg">{t.medal}</div>
                <div className="mt-0.5 text-[11.5px] font-extrabold">{t.badge}</div>
                <div className="text-[10.5px] text-[var(--gray)]">{t.tier} bookings · {peso(t.amount)}</div>
                <div className="mt-1 text-[10.5px] font-bold text-[var(--gray)]">{Math.max(0, t.slotsTotal - t.slotsTaken)} of {t.slotsTotal} slots left</div>
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {data.employee.role === "BOOKER" && (
        <Accordion title="Achievements">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.achievements.map((a) => (
              <div key={a.id} className={cn("rounded-2xl border p-4 text-center", a.unlocked ? "border-rausch/30 bg-rausch/5" : "border-[var(--line)] opacity-50")}>
                <div className="text-2xl">{a.unlocked ? "🏆" : "🔒"}</div>
                <div className="mt-1.5 text-[12.5px] font-bold">{a.label}</div>
              </div>
            ))}
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

      <Accordion title="Leaderboard" sub={leaderboard?.scope === "all" ? "top bookers, this month" : "your ranking"}>
        {!leaderboard && <p className="text-[13px] text-[var(--gray)]">Loading…</p>}
        {leaderboard?.scope === "all" && (
          <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
            {leaderboard.leaderboard.length === 0 && <p className="p-4 text-sm text-[var(--gray)]">No bookers on file.</p>}
            {leaderboard.leaderboard.map((r, i) => (
              <div key={r.employeeId} className="flex items-center gap-3 border-t border-[var(--line)] p-3.5 first:border-0">
                <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-extrabold", i === 0 ? "bg-amber text-white" : "bg-[var(--bg-2)] text-[var(--gray)]")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{r.name}</div>
                  <div className="text-[11.5px] text-[var(--gray)]">{r.completedThisMonth} bookings this month</div>
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
