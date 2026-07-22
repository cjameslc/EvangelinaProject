import { StatCard } from "@/components/ui/StatCard";
import { pesoCentavos } from "@/lib/format";
import { getFinancialAnalytics, type AnalyticsFilters } from "@/app/analytics/queries";

export async function FinancialSection({ user, filters }: { user: { role: string; ownedUnitIds: string[] }; filters: AnalyticsFilters }) {
  const fin = await getFinancialAnalytics(user, filters);
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-[14px] font-extrabold">Financial</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Gross Revenue" value={pesoCentavos(fin.grossRevenueCentavos)} sub="every booking's full value" info="Every non-cancelled booking's full amount, regardless of paid status." />
        <StatCard label="Net Revenue" value={pesoCentavos(fin.netRevenueCentavos)} sub="collected + downpayments" info="What's actually been paid or downpaid so far." />
        <StatCard label="Paid Expenses" value={pesoCentavos(fin.paidExpensesCentavos)} sub="bills paid this period" info="Bills marked paid, by their actual paid date." />
        <StatCard label="Pending Expenses" value={pesoCentavos(fin.pendingExpensesCentavos)} sub="unpaid, as of now" warn={fin.pendingExpensesCentavos > 0} tone="caution" info="Every currently-unpaid bill — a 'right now' figure, not scoped to the selected period." />
        <StatCard label="Cash Flow" value={pesoCentavos(fin.cashFlowCentavos)} warn={fin.cashFlowCentavos < 0} tone="caution" sub="net revenue − paid expenses" info="Money actually collected minus bills actually paid, this period." />
        <StatCard label="Outstanding Payments" value={pesoCentavos(fin.outstandingBalanceCentavos)} sub="owed on unpaid bookings" warn={fin.outstandingBalanceCentavos > 0} tone="caution" info="Remaining balance on this period's unpaid bookings (full amount, or amount minus downpayment)." />
      </div>
    </div>
  );
}
