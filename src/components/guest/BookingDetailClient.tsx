"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { peso, fmtDate, fmtTimeStr, formatUnitDisplay } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { isBookingCompleted } from "@/lib/bookingStatus";
import { resizeImageForUpload } from "@/lib/imageResize";
import { RateBreakdown } from "@/components/guest/RateBreakdown";

type Booking = {
  id: string; unitId: string; date: string; checkOutDate: string | null; checkOutTime: string | null; checkInTime: string | null;
  stayType: string; guests: string[]; pax: number | null; amount: number; dpAmount: number | null; paid: boolean;
  platform: string; specialRequest: string | null; checkedInAt: string | null; checkedOutAt: string | null; cancelledAt: string | null;
  proofUrl: string | null; dpProofUrl: string | null; createdAt: string;
  confirmationNumber: string | null; originalAmount: number | null; discountPct: number | null;
  couponCode: string | null; couponDiscountAmount: number | null;
  paymentType: string; intendedDpAmount: number | null;
  paymentVerificationStatus: string | null; paymentVerificationNote: string | null;
  unit: { id: string; name: string; shortName: string; unitNumber: string; photoUrl: string | null; location: string };
};

export function BookingDetailClient({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const cancellable = !booking.cancelledAt && new Date(booking.date) > new Date();
  const completed = !booking.cancelledAt && isBookingCompleted(booking);
  // Down payment not yet confirmed (dpAmount only ever gets set once
  // actually confirmed collected — see bookingService.ts) — the guest still
  // owes the reservation fee against dpProofUrl, not the full-amount field.
  const dpPending = booking.paymentType === "down_payment" && !booking.dpAmount;
  const uploadField: "proofUrl" | "dpProofUrl" = dpPending ? "dpProofUrl" : "proofUrl";
  const amountDueNow = dpPending ? (booking.intendedDpAmount ?? booking.amount) : booking.amount;
  // amount already reflects any confirmed down payment being subtracted
  // (see bookingService.ts), so total = amount + dpAmount in every case —
  // computed once here rather than repeating the formula in the visible
  // card and the PDF export.
  const totalAmount = booking.amount + (booking.dpAmount ?? 0);
  // Promo (weekday-night) and coupon are two independent, stacked
  // discounts (see RateBreakdown.tsx) — the coupon's own amount is
  // subtracted out here so this only ever reflects the promo's share,
  // never a conflated total that wouldn't match discountPct%.
  const discountAmount = (booking.originalAmount ?? 0) - totalAmount - (booking.couponDiscountAmount ?? 0);
  // "Confirmed" = the required payment step has actually been validated —
  // fully paid, or (for a down-payment booking) the down payment itself is
  // confirmed collected. Reserving with a down payment is a real, secured
  // booking even though the remaining balance is still outstanding, so this
  // is deliberately not the same thing as fully paid.
  const isConfirmed = booking.paid || (booking.paymentType === "down_payment" && !!booking.dpAmount);

  async function cancel() {
    if (cancelling || !confirm("Cancel this booking? This can't be undone.")) return;
    setCancelling(true);
    setError("");
    try {
      const res = await fetch(`/api/guest/bookings/${booking.id}/cancel`, { method: "POST" });
      if (!res.ok) { const j = await res.json().catch(() => null); setError(j?.error ?? "Couldn't cancel this booking."); return; }
      router.refresh();
    } catch {
      setError("Couldn't cancel this booking. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const resized = await resizeImageForUpload(file);
      const fd = new FormData();
      fd.append("file", resized);
      fd.append("field", uploadField);
      const res = await fetch(`/api/guest/bookings/${booking.id}/payment-proof`, { method: "POST", body: fd });
      if (!res.ok) { const j = await res.json().catch(() => null); setError(j?.error ?? "Couldn't upload proof."); return; }
      router.refresh();
    } catch {
      setError("Couldn't upload proof. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadInvoice() {
    if (!isConfirmed) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Evangelina's Staycation", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(110);
    doc.text(`Invoice — Booking ${booking.id}`, 14, 25);
    doc.setTextColor(0);
    autoTable(doc, {
      theme: "plain",
      startY: 34,
      headStyles: { fillColor: [255, 56, 92], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 10, cellPadding: 3 },
      head: [["Detail", "Value"]],
      body: [
        ["Confirmation number", booking.confirmationNumber ?? "—"],
        ["Guest", booking.guests.join(", ")],
        ["Property", formatUnitDisplay(booking.unit.unitNumber, booking.unit.name)],
        ["Stay type", STAY_TYPES[booking.stayType as keyof typeof STAY_TYPES]?.label ?? booking.stayType],
        ["Check-in", fmtDate(booking.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })],
        ["Check-out", booking.checkOutDate ? fmtDate(booking.checkOutDate, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"],
        ...(booking.discountPct ? [["Standard rate", peso(booking.originalAmount)], [`Weekday night promo (-${booking.discountPct}%)`, `-${peso(discountAmount)}`]] : []),
        ...(booking.couponCode && booking.couponDiscountAmount ? [[`Coupon (${booking.couponCode})`, `-${peso(booking.couponDiscountAmount)}`]] : []),
        ["Total amount", peso(totalAmount)],
        ["Down payment received", booking.dpAmount ? peso(booking.dpAmount) : "—"],
        ["Balance", peso(booking.amount)],
        ["Payment status", booking.paid ? "Paid" : isConfirmed ? "Confirmed" : "Pending"],
        ["Booked on", fmtDate(booking.createdAt, { month: "short", day: "numeric", year: "numeric" })],
      ],
    });
    doc.save(`invoice-${booking.id}.pdf`);
  }

  return (
    <div className="mx-auto max-w-[600px] px-4 py-5 sm:px-6">
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-[var(--bg-2)]">
        {booking.unit.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={booking.unit.photoUrl} alt={booking.unit.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-5xl">🏠</div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[20px] font-extrabold tracking-tight">{formatUnitDisplay(booking.unit.unitNumber, booking.unit.name)}</h1>
        {booking.cancelledAt && <span className="rounded-full bg-amber/10 px-2.5 py-1 text-[11px] font-extrabold uppercase text-amber">Cancelled</span>}
        {completed && <span className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-extrabold uppercase text-[var(--gray)]">Completed</span>}
      </div>
      <p className="text-[13px] text-[var(--gray)]">{booking.unit.location}</p>

      {booking.confirmationNumber && (
        <div className="card mt-5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Confirmation number</div>
          <div className="mt-1 text-[18px] font-extrabold tracking-wide">{booking.confirmationNumber}</div>
        </div>
      )}

      {completed && (
        <a href={`/guide/feedback/${booking.id}`} className="card mt-3 flex items-center justify-between gap-2 p-4 transition hover:bg-[var(--bg-2)]">
          <div>
            <div className="text-[13.5px] font-extrabold">⭐ Rate your stay</div>
            <div className="text-[12px] text-[var(--gray)]">Takes under a minute — unlock a reward.</div>
          </div>
          <span className="text-[18px] text-[var(--gray)]">›</span>
        </a>
      )}

      <div className="card mt-3 grid grid-cols-2 gap-4 p-5 text-[13.5px]">
        <div><div className="text-[11px] font-bold text-[var(--gray)]">Booking ID</div><div className="font-extrabold">{booking.id.slice(-8)}</div></div>
        <div><div className="text-[11px] font-bold text-[var(--gray)]">Stay type</div><div className="font-extrabold">{STAY_TYPES[booking.stayType as keyof typeof STAY_TYPES]?.label ?? booking.stayType}</div></div>
        <div><div className="text-[11px] font-bold text-[var(--gray)]">Check-in</div><div className="font-extrabold">{fmtDate(booking.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}{booking.checkInTime && ` · ${fmtTimeStr(booking.checkInTime)}`}</div></div>
        <div><div className="text-[11px] font-bold text-[var(--gray)]">Check-out</div><div className="font-extrabold">{booking.checkOutDate ? fmtDate(booking.checkOutDate, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}{booking.checkOutTime && ` · ${fmtTimeStr(booking.checkOutTime)}`}</div></div>
        <div><div className="text-[11px] font-bold text-[var(--gray)]">Guests</div><div className="font-extrabold">{booking.guests.join(", ")}{booking.pax ? ` · ${booking.pax} pax` : ""}</div></div>
        <div><div className="text-[11px] font-bold text-[var(--gray)]">Total</div><div className="font-extrabold">{peso(totalAmount)}</div></div>
      </div>

      {(!!booking.discountPct || !!booking.couponCode) && (
        <div className="card mt-3 p-4">
          <RateBreakdown
            standardTotal={booking.originalAmount ?? 0}
            discountPct={booking.discountPct ?? 0}
            discountAmount={discountAmount}
            couponCode={booking.couponCode}
            couponDiscountAmount={booking.couponDiscountAmount}
            total={totalAmount}
            showTotal={false}
          />
        </div>
      )}

      {booking.specialRequest && (
        <div className="card mt-3 p-4">
          <div className="text-[11px] font-bold text-[var(--gray)]">Special request</div>
          <div className="mt-1 text-[13.5px]">{booking.specialRequest}</div>
        </div>
      )}

      <div className="card mt-3 p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Payment status</div>
          <span className={`text-[13px] font-extrabold ${booking.paid ? "text-green" : isConfirmed ? "text-teal" : "text-amber"}`}>
            {booking.paid ? "Paid" : isConfirmed ? "Confirmed" : "Pending"}
          </span>
        </div>
        {dpPending && (
          <p className="mt-1 text-[13px] font-semibold text-[var(--ink)]">
            {peso(amountDueNow)} down payment due now — {peso(booking.amount - amountDueNow)} balance due later.
          </p>
        )}
        {!booking.paid && !booking.cancelledAt && (
          <div className="mt-3">
            {booking.paymentVerificationStatus === "needs_review" && (
              <p className="mb-2 text-[13px] font-semibold text-amber">{booking.paymentVerificationNote}</p>
            )}
            {booking.paymentVerificationStatus === "rejected" && (
              <p className="mb-2 text-[13px] font-semibold text-rausch">{booking.paymentVerificationNote}</p>
            )}
            {booking.paymentVerificationStatus === "auto_approved" && !dpPending && !!booking.dpAmount && (
              <p className="mb-2 text-[13px] font-semibold text-teal">✓ Down payment confirmed — upload proof of the remaining balance when ready.</p>
            )}
            {!(dpPending ? booking.dpProofUrl : booking.proofUrl) && (
              <p className="mb-2 text-[13px] text-[var(--gray)]">Already paid via GCash or bank transfer? Upload your receipt so we can confirm it.</p>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-sm">
              {uploading ? "Checking…" : `Upload ${dpPending ? "down payment" : "payment"} proof`}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadProof} />
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-[13px] font-semibold text-rausch">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {isConfirmed ? (
          <button onClick={downloadInvoice} className="btn btn-sm">Download invoice</button>
        ) : (
          <span className="text-[12.5px] text-[var(--gray)]">Invoice available once your payment is confirmed.</span>
        )}
        {cancellable && (
          <button onClick={cancel} disabled={cancelling} className="btn btn-sm text-rausch">
            {cancelling ? "Cancelling…" : "Cancel booking"}
          </button>
        )}
      </div>
    </div>
  );
}
