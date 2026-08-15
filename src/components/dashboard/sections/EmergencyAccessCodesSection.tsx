import { useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { fmtDate } from "@/lib/format";
import type { Unit } from "../types";

export function EmergencyAccessCodesSection({
  role,
  units,
  reserveCodeStats,
  ttlockStatus,
}: {
  role: string;
  units: Unit[];
  reserveCodeStats: { total: number; available: number; inUse: number; exhaustedUnits: Unit[]; neverProvisionedUnits?: Unit[] };
  ttlockStatus: { lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureMessage: string | null } | null;
}) {
  const canGrant = role === "OWNER_ADMIN";
  const lockedUnits = units.filter((u) => u.ttlockLockId);
  const neverProvisionedUnits = reserveCodeStats.neverProvisionedUnits ?? [];

  if (reserveCodeStats.total === 0 && neverProvisionedUnits.length === 0 && !(canGrant && lockedUnits.length > 0)) return null;

  return (
    <Accordion
      title="Emergency access codes"
      sub={ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt)) ? "TTLock issue detected" : "TTLock connected"}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total reserve codes" value={String(reserveCodeStats.total)} sub="across all units" />
        <StatCard label="Available" value={String(reserveCodeStats.available)} sub="ready for the next outage" />
        <StatCard
          label="In use"
          value={String(reserveCodeStats.inUse)}
          sub="assigned to a booking"
          warn={reserveCodeStats.exhaustedUnits.length > 0}
          tone={reserveCodeStats.exhaustedUnits.length > 0 ? "danger" : undefined}
        />
        <StatCard
          label="TTLock connection"
          value={ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt)) ? "Failing" : "OK"}
          sub={ttlockStatus?.lastFailureAt ? `Last failure ${fmtDate(ttlockStatus.lastFailureAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}` : "No failures recorded"}
          warn={!!ttlockStatus?.lastFailureAt && (!ttlockStatus.lastSuccessAt || new Date(ttlockStatus.lastFailureAt) > new Date(ttlockStatus.lastSuccessAt))}
        />
      </div>
      {reserveCodeStats.exhaustedUnits.length > 0 && (
        <p className="mt-3 rounded-lg bg-rausch/10 px-3 py-2 text-[12.5px] font-semibold text-rausch">
          ⚠️ {reserveCodeStats.exhaustedUnits.map((u) => u.shortName).join(", ")} {reserveCodeStats.exhaustedUnits.length === 1 ? "has" : "have"} zero available emergency codes left.
        </p>
      )}
      {neverProvisionedUnits.length > 0 && (
        <p className="mt-3 rounded-lg bg-rausch/10 px-3 py-2 text-[12.5px] font-semibold text-rausch">
          ⚠️ {neverProvisionedUnits.map((u) => u.shortName).join(", ")} {neverProvisionedUnits.length === 1 ? "has" : "have"} never had a reserve-code pool provisioned — no fallback at all if TTLock is unreachable.
        </p>
      )}
      {canGrant && lockedUnits.length > 0 && <GrantEmergencyAccess units={lockedUnits} />}
      {canGrant && lockedUnits.length > 0 && <ProvisionReserveCodes units={lockedUnits} neverProvisionedUnitIds={new Set(neverProvisionedUnits.map((u) => u.id))} />}
    </Accordion>
  );
}

/** OWNER_ADMIN-only — tops up (or first-provisions) a unit's permanent
 * 10-code reserve pool via POST /api/ttlock/reserve-codes/provision. This
 * endpoint already existed (built for the guest-booking/emergency-access
 * fallback) but had no UI trigger anywhere — the only way to run it was a
 * direct API call. Requires the unit's TTLock gateway to actually be
 * reachable right now (it writes real permanent passcodes to the physical
 * lock), so a gateway/network issue at the unit itself will still fail —
 * this button can't fix hardware, only save a manual API call once it's
 * back online. */
function ProvisionReserveCodes({ units, neverProvisionedUnitIds }: { units: Unit[]; neverProvisionedUnitIds: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [state, setState] = useState<{ loading: boolean; error: string | null; result: { created: number; alreadyHad: number } | null }>({ loading: false, error: null, result: null });

  async function provision() {
    setState({ loading: true, error: null, result: null });
    try {
      const res = await fetch("/api/ttlock/reserve-codes/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to provision reserve codes.");
      setState({ loading: false, error: null, result: data });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Failed to provision reserve codes.", result: null });
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 block text-[12.5px] font-bold text-violet hover:underline">
        + Provision reserve codes
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
      {state.result ? (
        <div className="text-[13px]">
          <div className="font-bold text-[var(--ink)]">
            {state.result.created > 0 ? `Created ${state.result.created} new code${state.result.created === 1 ? "" : "s"}.` : "Already at the full pool of 10 — nothing to add."}
          </div>
          <div className="mt-1 text-[12px] text-[var(--gray)]">{state.result.alreadyHad} code{state.result.alreadyHad === 1 ? "" : "s"} already existed for this unit before this run.</div>
          <button onClick={() => { setOpen(false); setState({ loading: false, error: null, result: null }); }} className="mt-2 text-[12px] font-bold text-[var(--gray)] hover:underline">Done</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input sm:w-52">
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.shortName} · Unit {u.unitNumber} {neverProvisionedUnitIds.has(u.id) ? "(none yet)" : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={provision} disabled={state.loading} className="btn-primary btn-sm">{state.loading ? "Provisioning…" : "Provision"}</button>
            <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}
      {state.error && <p className="mt-2 text-[12px] font-semibold text-rausch">{state.error}</p>}
    </div>
  );
}

/** OWNER_ADMIN-only standalone unit code, outside the normal per-booking
 * flow — goes through the same Access Control Service as everything else
 * (POST /api/access/emergency), always requires a reason, always logged. */
function GrantEmergencyAccess({ units }: { units: Unit[] }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<{ loading: boolean; error: string | null; code: string | null }>({ loading: false, error: null, code: null });

  async function grant() {
    if (!reason.trim()) { setState((s) => ({ ...s, error: "A reason is required." })); return; }
    setState({ loading: true, error: null, code: null });
    try {
      const res = await fetch("/api/access/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create emergency access code.");
      setState({ loading: false, error: null, code: data.code });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Failed to create emergency access code.", code: null });
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 text-[12.5px] font-bold text-violet hover:underline">
        + Grant emergency access
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
      {state.code ? (
        <div className="text-[13px]">
          <div className="font-bold text-[var(--ink)]">Emergency code: <span className="font-mono">{state.code}</span></div>
          <div className="mt-1 text-[12px] text-[var(--gray)]">Valid 24 hours. Logged to the access history.</div>
          <button onClick={() => { setOpen(false); setState({ loading: false, error: null, code: null }); setReason(""); }} className="mt-2 text-[12px] font-bold text-[var(--gray)] hover:underline">Done</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input sm:w-40">
            {units.map((u) => <option key={u.id} value={u.id}>{u.shortName} · Unit {u.unitNumber}</option>)}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="field-input flex-1"
          />
          <div className="flex gap-2">
            <button onClick={grant} disabled={state.loading} className="btn-primary btn-sm">{state.loading ? "Generating…" : "Generate"}</button>
            <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}
      {state.error && <p className="mt-2 text-[12px] font-semibold text-rausch">{state.error}</p>}
    </div>
  );
}
