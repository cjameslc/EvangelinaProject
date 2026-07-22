"use client";

import { useState } from "react";
import type { CalendarCellStatus } from "@/lib/analytics/occupancy";

const STATUS_COLOR: Record<CalendarCellStatus, string> = {
  booked: "#FF385C",
  maintenance: "#C87D00",
  cleaning: "#6C5CE7",
  available: "var(--bg-2)",
};
const STATUS_LABEL: Record<CalendarCellStatus, string> = {
  booked: "Booked",
  maintenance: "Maintenance",
  cleaning: "Cleaning",
  available: "Available",
};

export type CalendarUnit = { id: string; label: string };
export type CalendarCell = { unitId: string; dateKey: string; status: CalendarCellStatus };

export function OccupancyCalendarGrid({ units, days, cells }: { units: CalendarUnit[]; days: string[]; cells: CalendarCell[] }) {
  const [selected, setSelected] = useState<{ unitLabel: string; dateKey: string; status: CalendarCellStatus } | null>(null);
  const cellMap = new Map(cells.map((c) => [`${c.unitId}::${c.dateKey}`, c.status]));

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="mb-1 flex gap-[3px] pl-[100px]">
            {days.map((d) => (
              <div key={d} className="w-5 flex-none text-center text-[9px] font-semibold text-[var(--gray)]">
                {d.slice(8, 10)}
              </div>
            ))}
          </div>
          {units.map((u) => (
            <div key={u.id} className="mb-[3px] flex items-center gap-[3px]">
              <div className="w-[100px] flex-none truncate text-[11.5px] font-bold">{u.label}</div>
              {days.map((d) => {
                const status = cellMap.get(`${u.id}::${d}`) ?? "available";
                return (
                  <button
                    key={d}
                    onClick={() => setSelected({ unitLabel: u.label, dateKey: d, status })}
                    className="h-5 w-5 flex-none rounded-[3px] transition hover:ring-2 hover:ring-[var(--ink)]"
                    style={{ background: STATUS_COLOR[status] }}
                    aria-label={`${u.label} ${d}: ${STATUS_LABEL[status]}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {(Object.keys(STATUS_LABEL) as CalendarCellStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--gray)]">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3 text-[12.5px]">
          <span><strong>{selected.unitLabel}</strong> · {selected.dateKey} — {STATUS_LABEL[selected.status]}</span>
          <button onClick={() => setSelected(null)} className="font-semibold text-[var(--gray)] underline">Close</button>
        </div>
      )}
    </div>
  );
}
