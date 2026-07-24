// Re-exported (not redeclared) so the UI's status list can never drift
// from the Zod schema's — see LAUNDRY_STATUSES in validation.ts.
export { LAUNDRY_STATUSES, LAUNDRY_PAYMENT_METHODS } from "@/lib/validation";

export const LAUNDRY_STATUS_COLOR: Record<string, string> = {
  Received: "#8E99AA",
  Washing: "#6C5CE7",
  Drying: "#0EA5A0",
  Ironing: "#C87D00",
  Folding: "#00A699",
  "Ready for Pickup": "#FF385C",
  Delivered: "#008A05",
  Cancelled: "#484848",
};

/** The next status in the normal forward workflow — used for a quick
 * "Advance" action, without preventing staff from picking any status
 * directly via the full picker for a real-world out-of-order case. */
export const LAUNDRY_NEXT_STATUS: Record<string, string | null> = {
  Received: "Washing",
  Washing: "Drying",
  Drying: "Ironing",
  Ironing: "Folding",
  Folding: "Ready for Pickup",
  "Ready for Pickup": "Delivered",
  Delivered: null,
  Cancelled: null,
};

export const LAUNDRY_PAYMENT_METHOD_LABEL: Record<string, string> = {
  Cash: "Cash",
  GCash: "GCash",
  BankTransfer: "Bank transfer",
  Card: "Credit/Debit card",
  OtherWallet: "Other digital wallet",
};
