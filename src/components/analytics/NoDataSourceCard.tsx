// A visible, explicit placeholder for every spec'd metric this app has no
// real data to back (Customer Satisfaction, Taxes, Guest Demographics,
// Average Response Time, ...) — used instead of silently omitting the
// metric, so an exclusion is always something a viewer can see and
// understand, never just a gap they might assume is a bug.
export function NoDataSourceCard({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="stat-card border-dashed opacity-70">
      <div className="text-[12px] font-bold uppercase leading-tight tracking-wide text-[var(--gray)]">{label}</div>
      <div className="mt-1.5 text-[15px] font-bold text-[var(--gray)]">No data source</div>
      <div className="mt-0.5 text-[12px] text-[var(--gray)]">{reason}</div>
    </div>
  );
}
