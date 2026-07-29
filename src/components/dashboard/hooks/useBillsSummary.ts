import { useMemo } from "react";
import { billCentavos } from "@/lib/format";
import { BILL_TYPES } from "@/lib/constants";
import { paidExpensesCentavos, pendingExpensesCentavos } from "@/lib/finance";
import { manilaDayKey as dayOf } from "@/lib/analytics/period";
import type { Bill } from "../types";

export function useBillsSummary({ bills, todayIso }: { bills: Bill[]; todayIso: string }) {
  function billMeta(b: Bill) {
    const known = BILL_TYPES.find((t) => t.key === b.key);
    return { icon: known?.icon ?? "💳", label: b.label || known?.label || b.key, sub: known?.sub ?? "Custom bill" };
  }
  // Resolves a bill's dueDay (1-31) against its own billing month, clamped
  // to that month's real length (e.g. dueDay 31 in February -> Feb 28/29).
  // b.month is stored as a UTC instant representing Manila local midnight
  // (e.g. 2026-06-30T16:00:00Z = Jul 1 00:00 Manila) — reading it with
  // getUTCMonth() would misread it as June, so go through dayOf() like the
  // rest of this file does.
  function dueDateFor(b: Bill) {
    if (!b.dueDay) return null;
    const [my, mm] = dayOf(new Date(b.month)).split("-").map(Number);
    const lastDay = new Date(Date.UTC(my, mm, 0)).getUTCDate();
    return new Date(Date.UTC(my, mm - 1, Math.min(b.dueDay, lastDay)));
  }

  // Soonest due date first; bills with no due date set fall to the end.
  // Feeds the exported monthly report and the "needs attention" summary,
  // which both need the complete unpaid list, not just the near-term ones.
  const dueBills = [...bills.filter((b) => !b.paid)].sort((a, b) => {
    const da = dueDateFor(a);
    const db = dueDateFor(b);
    if (da && db) return da.getTime() - db.getTime();
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  const overdueCentavos = useMemo(() => {
    const todayDate = new Date(`${todayIso}T00:00:00Z`);
    return dueBills.reduce((s, b) => {
      const d = dueDateFor(b);
      return d && d < todayDate ? s + billCentavos(b) : s;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueBills, todayIso]);

  // Centavo-precise (recurring-expense templates carry real cents, e.g.
  // ₱18,300.26) — summed here, then only rounded to whole pesos at the very
  // end for display, so the cents aren't lost partway through Net
  // Profit/Cash Flow/Margin's arithmetic below. billsDueMonthCentavos is
  // "Pending" money — informational only (shown in Upcoming expenses), and
  // must never be subtracted from a profit/cash-flow figure; see
  // src/lib/finance.ts for the single place that rule lives.
  const billsDueMonthCentavos = useMemo(() => pendingExpensesCentavos(bills), [bills]);
  const billsPaidMonthCentavos = useMemo(() => paidExpensesCentavos(bills), [bills]);
  const billsDueMonth = Math.round(billsDueMonthCentavos / 100);
  const billsPaidMonth = Math.round(billsPaidMonthCentavos / 100);

  return { billMeta, dueDateFor, dueBills, overdueCentavos, billsDueMonthCentavos, billsPaidMonthCentavos, billsDueMonth, billsPaidMonth };
}
