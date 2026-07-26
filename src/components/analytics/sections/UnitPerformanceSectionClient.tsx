"use client";

import { useState } from "react";
import { peso, pesoCentavos, formatUnitDisplay } from "@/lib/format";
import type { UnitPerformanceAnalytics } from "@/app/analytics/queries";

export function UnitPerformanceSectionClient({ data }: { data: UnitPerformanceAnalytics }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {data.best && data.worst && data.best.unitId !== data.worst.unitId && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#00A699]/10 px-3 py-1.5 text-[12px] font-extrabold text-[#00A699]">🏆 Best: {formatUnitDisplay(data.best.unitNumber, data.best.name)} · {pesoCentavos(data.best.revenueCentavos)}</span>
          <span className="rounded-full bg-amber/10 px-3 py-1.5 text-[12px] font-extrabold text-amber">Needs attention: {formatUnitDisplay(data.worst.unitNumber, data.worst.name)} · {pesoCentavos(data.worst.revenueCentavos)}</span>
        </div>
      )}

      <div className="space-y-2">
        {data.rows.map((row) => (
          <div key={row.unitId} className="rounded-xl border border-[var(--line)]">
            <button
              onClick={() => setSelected((prev) => (prev === row.unitId ? null : row.unitId))}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div>
                <div className="text-[13px] font-extrabold">{formatUnitDisplay(row.unitNumber, row.name)}</div>
                <div className="text-[11.5px] text-[var(--gray)]">{row.occupancyPct}% occupancy · {row.bookingCount} bookings · ★ {row.rating.toFixed(1)}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-extrabold">{pesoCentavos(row.revenueCentavos)}</div>
                <div className={`text-[11px] font-semibold ${row.profitCentavos < 0 ? "text-rausch" : "text-[var(--gray)]"}`}>{pesoCentavos(row.profitCentavos)} profit</div>
              </div>
            </button>
            {selected === row.unitId && (
              <div className="grid grid-cols-2 gap-3 border-t border-[var(--line)] p-3 sm:grid-cols-4">
                <div><div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">ADR</div><div className="text-[13px] font-extrabold">{peso(Math.round(row.adrCentavos / 100))}</div></div>
                <div><div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">RevPAR</div><div className="text-[13px] font-extrabold">{peso(Math.round(row.revparCentavos / 100))}</div></div>
                <div><div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Expenses</div><div className="text-[13px] font-extrabold">{pesoCentavos(row.expensesCentavos)}</div></div>
                <div><div className="text-[10.5px] font-bold uppercase text-[var(--gray)]">Listed Rating</div><div className="text-[13px] font-extrabold">★ {row.rating.toFixed(1)} <span className="text-[10px] font-semibold text-[var(--gray)]">(static)</span></div></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
