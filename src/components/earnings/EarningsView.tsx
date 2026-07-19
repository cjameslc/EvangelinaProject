"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { StatCard } from "@/components/ui/StatCard";
import { Accordion } from "@/components/ui/Accordion";
import { PageLoading } from "@/components/ui/PageLoading";
import { peso, fmtDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { FilePdfIcon } from "@/components/ui/Icons";

type EmployeeLite = { id: string; name: string; role: string };
type TeamLineItem = { label: string; detail: string; amount: number; deduction?: boolean };
type PerUnitProgress = {
  unitId: string; unitName: string; unitNumber: string; completedThisMonth: number;
  nextTier: number | null; nextTierAmount: number | null; remaining: number; progressPct: number; tiersAwardedThisMonth: number[];
};
type Achievement = { id: string; label: string; unlocked: boolean };
type PayrollHistoryRow = { weekStart: string; weekEnd: string; salary: number; activity: number; bookingCount: number; bonuses: number; total: number; status: string };
type BonusAward = { id: string; unitName: string; month: string; tier: number; amount: number; awardedAt: string };
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
  perUnitProgress: PerUnitProgress[];
  achievements: Achievement[];
  payrollHistory: PayrollHistoryRow[];
  bonusAwards: BonusAward[];
  adjustments: Adjustment[];
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

      {data.perUnitProgress.length > 0 && (
        <Accordion title="Progress to next bonus" sub="per unit, this month">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.perUnitProgress.map((p) => (
              <div key={p.unitId} className="rounded-2xl border border-[var(--line)] p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[14px] font-extrabold">{p.unitNumber} · {p.unitName}</span>
                  <span className="text-[12.5px] font-bold text-[var(--gray)]">{p.completedThisMonth}{p.nextTier ? ` / ${p.nextTier}` : ""} bookings</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div className="h-full rounded-full bg-rausch transition-all" style={{ width: `${p.progressPct}%` }} />
                </div>
                {p.nextTier ? (
                  <p className="mt-2 text-[12.5px] font-semibold text-[var(--gray)]">
                    {p.remaining} more booking{p.remaining === 1 ? "" : "s"} to unlock <b className="text-[var(--ink)]">{peso(p.nextTierAmount ?? 0)}</b>
                  </p>
                ) : (
                  <p className="mt-2 text-[12.5px] font-semibold text-green">All bonus tiers unlocked for this unit this month 🎉</p>
                )}
                {p.tiersAwardedThisMonth.length > 0 && (
                  <p className="mt-1 text-[11.5px] text-[var(--gray)]">Earned this month: {p.tiersAwardedThisMonth.map((t) => `${t}-booking bonus`).join(", ")}</p>
                )}
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
