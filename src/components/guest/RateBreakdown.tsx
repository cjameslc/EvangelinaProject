import { peso } from "@/lib/format";

/** Shared standard-rate/promo/coupon/total display — used on the booking details step, payment step, and booking detail page, so all three can never show inconsistent numbers or drift in wording. Promo (automatic, weekday-night) and coupon (guest-entered code) are two independent, stacked discounts — always shown as separate lines rather than combined into one, so a guest can see exactly why their total is what it is. */
export function RateBreakdown({
  standardTotal,
  discountPct,
  discountAmount,
  couponCode,
  couponDiscountAmount,
  total,
  showTotal = true,
}: {
  standardTotal: number;
  discountPct: number;
  discountAmount: number;
  couponCode?: string | null;
  couponDiscountAmount?: number | null;
  total: number;
  showTotal?: boolean;
}) {
  return (
    <div className="space-y-1 text-[13.5px]">
      <div className="flex justify-between">
        <span className="text-[var(--gray)]">Standard rate</span>
        <span className={discountPct > 0 ? "line-through text-[var(--gray)]" : "font-bold"}>{peso(standardTotal)}</span>
      </div>
      {discountPct > 0 && (
        <div className="flex justify-between text-teal">
          <span>Weekday night promo (−{discountPct}%)</span>
          <span>−{peso(discountAmount)}</span>
        </div>
      )}
      {!!couponCode && !!couponDiscountAmount && (
        <div className="flex justify-between text-teal">
          <span>Coupon ({couponCode})</span>
          <span>−{peso(couponDiscountAmount)}</span>
        </div>
      )}
      {showTotal && (
        <div className="flex justify-between text-[15px] font-extrabold">
          <span>Total</span>
          <span>{peso(total)}</span>
        </div>
      )}
    </div>
  );
}
