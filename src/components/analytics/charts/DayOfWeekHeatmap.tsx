// Plain CSS, not Recharts — a 7-cell color-intensity row doesn't need a
// charting library. Color intensity scales with count relative to the
// week's busiest day.
export function DayOfWeekHeatmap({ data, label }: { data: { dow: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-bold text-[var(--gray)]">{label}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {data.map((d) => {
          const intensity = d.count / max;
          return (
            <div key={d.dow} className="flex flex-col items-center gap-1">
              <div
                className="flex h-11 w-full items-center justify-center rounded-lg text-[12px] font-extrabold"
                style={{
                  background: intensity === 0 ? "var(--bg-2)" : `rgba(255, 56, 92, ${0.15 + intensity * 0.65})`,
                  color: intensity > 0.5 ? "#fff" : "var(--ink)",
                }}
              >
                {d.count}
              </div>
              <span className="text-[10.5px] font-semibold text-[var(--gray)]">{d.dow}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
