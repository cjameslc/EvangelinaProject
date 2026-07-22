"use client";

import { useMemo, useState } from "react";
import { peso, fmtDate } from "@/lib/format";
import type { StaffAnalytics } from "@/app/analytics/queries";

export function StaffSectionClient({ data }: { data: StaffAnalytics }) {
  const [selected, setSelected] = useState<string | null>(null);

  const selectedBookings = useMemo(() => {
    if (!selected) return [];
    return data.bookings.filter((b) => b.bookerId === selected || b.cleanerId === selected);
  }, [selected, data.bookings]);

  if (data.rows.length === 0) {
    return <p className="text-[13px] text-[var(--gray)]">No active payroll-role staff to report on.</p>;
  }

  return (
    <div className="space-y-2">
      {data.rows.map((row) => (
        <div key={row.employeeId} className="rounded-xl border border-[var(--line)]">
          <button
            onClick={() => setSelected((prev) => (prev === row.employeeId ? null : row.employeeId))}
            className="flex w-full items-center justify-between p-3 text-left"
          >
            <div>
              <div className="text-[13px] font-extrabold">{row.name}</div>
              <div className="text-[11.5px] text-[var(--gray)]">{row.bookingsLogged} booked · {row.cleaningsCompleted} cleaned · {row.activitiesPerDay}/day</div>
            </div>
            <div className="text-[14px] font-extrabold">{peso(Math.round(row.totalEarnedCentavos / 100))}</div>
          </button>
          {selected === row.employeeId && (
            <div className="border-t border-[var(--line)] p-3">
              <p className="mb-2 text-[11px] text-[var(--gray)]">{row.subtitle}</p>
              {selectedBookings.length === 0 ? (
                <p className="text-[12.5px] text-[var(--gray)]">No bookings in this period.</p>
              ) : (
                <div className="space-y-1">
                  {selectedBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-[12px]">
                      <span>{fmtDate(b.date, { month: "short", day: "numeric", timeZone: "UTC" })} · {b.stayType}</span>
                      <span className="text-[var(--gray)]">{b.bookerId === row.employeeId ? "Booked" : ""}{b.bookerId === row.employeeId && b.cleanerId === row.employeeId ? " + " : ""}{b.cleanerId === row.employeeId ? "Cleaned" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
