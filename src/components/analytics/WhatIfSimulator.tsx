"use client";

import { useMemo, useState } from "react";
import { peso } from "@/lib/format";

// Brief section 17 — a deliberately SIMPLIFIED, client-side-only sensitivity
// model (not a byte-for-byte replica of profitability.ts's real waterfall,
// which requires server-fetched booking/expense data this component never
// receives). Every baseline number is real (passed down from the actual
// computed P&L for the current month); every slider recomputes instantly
// against that same baseline using transparent, real arithmetic — never a
// black box.
export type SimulatorBaseline = {
  adrPesos: number;
  occupancyPct: number;
  bookingsPerMonth: number;
  grossRevenuePesos: number;
  electricityPesos: number;
  waterPesos: number;
  payrollPesos: number;
  marketingPesos: number;
  fixedCostsPesos: number; // amortization + internet + assoc dues + subscriptions + other fixed
  operationalPesos: number;
};

export function WhatIfSimulator({ baseline, title = "What-If Simulator" }: { baseline: SimulatorBaseline; title?: string }) {
  const [adrDelta, setAdrDelta] = useState(0);
  const [occupancyDeltaPct, setOccupancyDeltaPct] = useState(0);
  const [bookingsDelta, setBookingsDelta] = useState(0);
  const [electricityPct, setElectricityPct] = useState(0);
  const [payrollPct, setPayrollPct] = useState(0);
  const [marketingDelta, setMarketingDelta] = useState(0);
  const [fixedCostsDelta, setFixedCostsDelta] = useState(0);

  const result = useMemo(() => {
    // Revenue scales with both the ADR change and the occupancy/booking
    // volume change — occupancy% and booking count move revenue the same
    // direction, so their effects compose multiplicatively on top of ADR.
    const adrFactor = baseline.adrPesos > 0 ? (baseline.adrPesos + adrDelta) / baseline.adrPesos : 1;
    const occupancyFactor = baseline.occupancyPct > 0 ? (baseline.occupancyPct + occupancyDeltaPct) / baseline.occupancyPct : 1;
    const bookingsFactor = baseline.bookingsPerMonth > 0 ? (baseline.bookingsPerMonth + bookingsDelta) / baseline.bookingsPerMonth : 1;
    const revenuePesos = Math.round(baseline.grossRevenuePesos * adrFactor * occupancyFactor * bookingsFactor);

    const electricityPesos = Math.round(baseline.electricityPesos * (1 + electricityPct / 100));
    const payrollPesos = Math.round(baseline.payrollPesos * (1 + payrollPct / 100));
    const marketingPesos = Math.max(0, baseline.marketingPesos + marketingDelta);
    const fixedCostsPesos = Math.max(0, baseline.fixedCostsPesos + fixedCostsDelta);
    // Variable operational cost scales with booking volume, same as the
    // real model allocates it per booking.
    const operationalPesos = Math.round(baseline.operationalPesos * bookingsFactor);

    const expensesPesos = electricityPesos + baseline.waterPesos + payrollPesos + marketingPesos + fixedCostsPesos + operationalPesos;
    const profitPesos = revenuePesos - expensesPesos;
    const marginPct = revenuePesos > 0 ? Math.round((profitPesos / revenuePesos) * 100) : 0;

    const baselineExpenses = baseline.electricityPesos + baseline.waterPesos + baseline.payrollPesos + baseline.marketingPesos + baseline.fixedCostsPesos + baseline.operationalPesos;
    const baselineProfit = baseline.grossRevenuePesos - baselineExpenses;

    return { revenuePesos, expensesPesos, profitPesos, marginPct, profitDeltaPesos: profitPesos - baselineProfit };
  }, [baseline, adrDelta, occupancyDeltaPct, bookingsDelta, electricityPct, payrollPct, marketingDelta, fixedCostsDelta]);

  function reset() {
    setAdrDelta(0); setOccupancyDeltaPct(0); setBookingsDelta(0); setElectricityPct(0); setPayrollPct(0); setMarketingDelta(0); setFixedCostsDelta(0);
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[13.5px] font-extrabold">{title}</h4>
        <button onClick={reset} className="text-[11.5px] font-semibold text-[var(--gray)] underline">Reset</button>
      </div>
      <p className="mb-3 text-[11.5px] text-[var(--gray)]">A simplified sensitivity model against this month&apos;s real baseline — for exploring which lever moves profit the most, not a precise re-forecast.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SliderRow label="ADR" value={adrDelta} onChange={setAdrDelta} min={-500} max={500} step={25} format={(v) => `${v >= 0 ? "+" : ""}${peso(v)}`} />
        <SliderRow label="Occupancy" value={occupancyDeltaPct} onChange={setOccupancyDeltaPct} min={-30} max={30} step={1} format={(v) => `${v >= 0 ? "+" : ""}${v} pts`} />
        <SliderRow label="Bookings/month" value={bookingsDelta} onChange={setBookingsDelta} min={-20} max={20} step={1} format={(v) => `${v >= 0 ? "+" : ""}${v}`} />
        <SliderRow label="Electricity cost" value={electricityPct} onChange={setElectricityPct} min={-30} max={50} step={5} format={(v) => `${v >= 0 ? "+" : ""}${v}%`} />
        <SliderRow label="Payroll cost" value={payrollPct} onChange={setPayrollPct} min={-20} max={30} step={5} format={(v) => `${v >= 0 ? "+" : ""}${v}%`} />
        <SliderRow label="Marketing spend" value={marketingDelta} onChange={setMarketingDelta} min={-10000} max={10000} step={500} format={(v) => `${v >= 0 ? "+" : ""}${peso(v)}`} />
        <SliderRow label="Fixed costs" value={fixedCostsDelta} onChange={setFixedCostsDelta} min={-10000} max={10000} step={500} format={(v) => `${v >= 0 ? "+" : ""}${peso(v)}`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--bg-2)] p-3 sm:grid-cols-4">
        <SimStat label="Revenue" value={peso(result.revenuePesos)} />
        <SimStat label="Expenses" value={peso(result.expensesPesos)} />
        <SimStat label="Profit" value={peso(result.profitPesos)} />
        <SimStat label="Margin" value={`${result.marginPct}%`} />
      </div>
      <p className={`mt-2 text-[12.5px] font-bold ${result.profitDeltaPesos >= 0 ? "text-teal" : "text-rausch"}`}>
        {result.profitDeltaPesos >= 0 ? "+" : ""}{peso(result.profitDeltaPesos)} vs this month&apos;s actual profit
      </p>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] font-semibold text-[var(--gray)]">
        <span>{label}</span>
        <span className="font-bold text-[var(--ink)]">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--skin-primary,#6C5CE7)]"
      />
    </div>
  );
}

function SimStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className="mt-0.5 text-[15px] font-extrabold">{value}</div>
    </div>
  );
}
