"use client";

import { useEffect, useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Tag } from "@/components/ui/Tag";
import { TrashIcon } from "@/components/ui/Icons";
import { peso, fmtDate } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { canDeleteBookings } from "@/lib/rbac";
import { manilaTodayISO } from "@/lib/manilaTime";

type Unit = { id: string; name: string; unitNumber: string; shortName: string };
type LogEntry = {
  id: string;
  type: "cancelled" | "rescheduled" | "other";
  unitId: string | null;
  unit: { shortName: string } | null;
  guestName: string;
  contactNumber: string | null;
  transactionDate: string;
  amount: number | null;
  note: string | null;
  createdBy: { name: string } | null;
  createdAt: string;
};

const TYPE_LABEL: Record<LogEntry["type"], string> = {
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  other: "Other",
};

/**
 * A cancelled Booking already has its own full record and belongs in the
 * Bookings tab as-is (Booking.cancelledAt). This panel is specifically for
 * transactions that never became — or are no longer — a real Booking row at
 * all (an inquiry that fell through before staff logged it, a reschedule
 * worked out over chat and re-entered as a fresh booking), so month-end
 * reporting can still see they happened instead of leaving no trace.
 */
export function BookingActivityLogPanel({ units, role }: { units: Unit[]; role: string }) {
  const toast = useToast();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<LogEntry["type"]>("cancelled");
  const [unitId, setUnitId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [transactionDate, setTransactionDate] = useState(manilaTodayISO());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function refresh() {
    setLoading(true);
    fetch("/api/booking-activity-log")
      .then((r) => r.json())
      .then((d) => setEntries(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !transactionDate) {
      toast("Guest name and date are required.", true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking-activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, unitId: unitId || null, guestName: guestName.trim(),
          contactNumber: contactNumber.trim() || null, transactionDate,
          amount: amount ? Number(amount) : null, note: note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast(json.error ?? "Couldn't log that transaction.", true); return; }
      toast("Transaction logged ✓");
      setGuestName(""); setContactNumber(""); setAmount(""); setNote(""); setUnitId("");
      setTransactionDate(manilaTodayISO());
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this logged transaction?")) return;
    const res = await fetch(`/api/booking-activity-log/${id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete that entry.", true); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast("Deleted");
  }

  const canDelete = canDeleteBookings(role as any);

  return (
    <Accordion title="Log a cancelled / rescheduled transaction" sub={`${entries.length} this month`} defaultOpen={false}>
      <p className="mb-4 text-[12.5px] text-[var(--gray)]">
        For anything that never became a Booking row here — an inquiry that fell through, a reschedule worked out
        over chat — so it still shows up in this month’s activity even without a formal booking behind it.
        A booking that was created here and then cancelled already has its own record in the list above.
      </p>

      <form onSubmit={submit} className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <select value={type} onChange={(e) => setType(e.target.value as LogEntry["type"])} className="field-input">
          <option value="cancelled">Cancelled</option>
          <option value="rescheduled">Rescheduled</option>
          <option value="other">Other</option>
        </select>
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input">
          <option value="">No specific unit</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.shortName}</option>)}
        </select>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" className="field-input" required />
        <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Contact number (optional)" className="field-input" />
        <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className="field-input" required />
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (optional)" className="field-input" />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note / reason (optional)" className="field-input sm:col-span-2" rows={2} />
        <div className="sm:col-span-2">
          <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
            {submitting ? "Logging…" : "Log transaction"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-[var(--gray)]">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-[var(--gray)]">No logged transactions this month.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--line)]">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag variant={e.type}>{TYPE_LABEL[e.type]}</Tag>
                  <span className="text-[13.5px] font-bold">{e.guestName}</span>
                  {e.unit && <span className="text-[12px] text-[var(--gray)]">· {e.unit.shortName}</span>}
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--gray)]">
                  {fmtDate(e.transactionDate, { month: "short", day: "numeric", timeZone: "UTC" })}
                  {e.contactNumber && ` · ${e.contactNumber}`}
                  {e.amount != null && ` · ${peso(e.amount)}`}
                  {e.createdBy && ` · logged by ${e.createdBy.name}`}
                </p>
                {e.note && <p className="mt-1 text-[12.5px] text-[var(--ink)]">{e.note}</p>}
              </div>
              {canDelete && (
                <button onClick={() => remove(e.id)} aria-label="Delete" className="flex-none text-[var(--gray)] hover:text-rausch">
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Accordion>
  );
}
