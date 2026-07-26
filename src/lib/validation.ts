import { z } from "zod";

/** A date/checkOutDate string that fails to parse (garbage input, "2026-13-45",
 * etc.) must never reach `new Date(...)` unchecked downstream — it produces
 * an Invalid Date that Prisma then throws an unhandled 500 on. Field-level
 * refine (not a schema-wide one) so bookingSchema.partial() below still
 * works — .partial() only exists on a plain ZodObject, but refining an
 * individual field's own validator doesn't change that. */
const isValidDateString = (v: string) => !Number.isNaN(new Date(v).getTime());

/** Airbnb has no day-use product — every Airbnb booking is a full 21-hour stay, never a Daycation or Night stay. Enforced here (server) and mirrored client-side in BookingForm's stay-type picker. */
export function normalizeStayTypeForPlatform<T extends string>(platform: string, stayType: T): T | "Full" {
  return platform === "Airbnb" ? "Full" : stayType;
}

// Plain ZodObject (not wrapped in .refine) — [id]/route.ts calls
// bookingSchema.partial() for PATCH, which only exists on a ZodObject, and a
// partial update legitimately doesn't require every field to be present.
// Flexible's "must have both times" rule is enforced separately, only on
// full create (see createBookingCore in bookingService.ts), since a PATCH
// that only touches e.g. the amount shouldn't be forced to resend times.
export const bookingSchema = z.object({
  unitId: z.string().min(1),
  date: z.string().min(1).refine(isValidDateString, "Invalid date."),
  checkOutDate: z.string().nullable().optional().refine((v) => !v || isValidDateString(v), "Invalid check-out date."),
  // Flexible is staff-only (not offered in the Guest Portal booking flow) —
  // a same-day stay whose check-in/check-out times are picked freely rather
  // than following Daycation/Night's fixed windows. See stayRange.ts's
  // bookingsConflict for how its actual times are used for real
  // time-of-day overlap checking, not just a same-day/different-type
  // assumption.
  stayType: z.enum(["Daycation", "Night", "Full", "Flexible"]),
  checkInTime: z.string().nullable().optional(),
  checkOutTime: z.string().nullable().optional(),
  guests: z.array(z.string()).min(1),
  pax: z.number().int().positive().nullable().optional(),
  contactNumber: z.string().min(7),
  bookerId: z.string().nullable().optional(),
  cleanerId: z.string().nullable().optional(),
  platform: z.enum(["Airbnb", "TikTok", "Facebook", "WalkIn", "Direct", "Other"]),
  platformOther: z.string().nullable().optional(),
  dpAmount: z.number().int().nonnegative().nullable().optional(),
  dpReceivedById: z.string().nullable().optional(),
  dpMethod: z.enum(["Cash", "GCash", "BankTransfer"]).nullable().optional(),
  dpProofUrl: z.string().nullable().optional(),
  amount: z.number().int().nonnegative(),
  receivedById: z.string().nullable().optional(),
  method: z.enum(["Cash", "GCash", "BankTransfer"]).nullable().optional(),
  proofUrl: z.string().nullable().optional(),
  paid: z.boolean().optional(),
  // Set by the Booker "Today" quick-actions (src/components/bookings/BookingsView.tsx)
  // — a lightweight arrival/departure timestamp, independent of the
  // date/checkOutDate fields which describe the planned stay, not what
  // actually happened.
  checkedInAt: z.string().nullable().optional().refine((v) => !v || isValidDateString(v), "Invalid check-in timestamp."),
  checkedOutAt: z.string().nullable().optional().refine((v) => !v || isValidDateString(v), "Invalid check-out timestamp."),
  // Guest Portal only — a free-text note the guest adds when booking.
  specialRequest: z.string().nullable().optional(),
  // Guest Portal only — see src/lib/pricing/rates.ts + src/lib/bookingService.ts.
  originalAmount: z.number().int().nonnegative().nullable().optional(),
  discountPct: z.number().int().min(0).max(100).nullable().optional(),
  paymentType: z.enum(["full", "down_payment"]).optional(),
  intendedDpAmount: z.number().int().nonnegative().nullable().optional(),
  // Free-text notes the booker adds when logging a booking — staff-only,
  // distinct from specialRequest (guest-submitted via the Guest Portal).
  notes: z.string().nullable().optional(),
  // Guest Portal only — an applied coupon's code + the peso amount it
  // actually discounted, snapshotted at booking time. See
  // src/lib/bookingEngine/couponService.ts.
  couponCode: z.string().nullable().optional(),
  couponDiscountAmount: z.number().int().nonnegative().nullable().optional(),
});

// Admin-managed discount codes (Settings tab) — see src/lib/pricing/rates.ts's
// applyCouponDiscount and src/lib/bookingEngine/couponService.ts.
// Plain ZodObject (not wrapped in .refine) — same reasoning as bookingSchema
// above: /api/coupons/[id] calls couponSchema.partial() for PATCH. The
// "percent can't exceed 100" rule is field-level (value.max(100) only when
// type is "percent" isn't expressible per-field), so it's checked by hand
// in the POST/PATCH route instead of via a schema-wide refine.
export const couponSchema = z.object({
  code: z.string().trim().min(2, "Code must be at least 2 characters.").max(30, "Keep the code under 30 characters.")
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, dashes, and underscores only.")
    .transform((v) => v.toUpperCase()),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional().refine((v) => !v || isValidDateString(v), "Invalid expiry date."),
  active: z.boolean().optional(),
  description: z.string().max(200).nullable().optional(),
});

// Staff-side cancellation — POST /api/bookings/[id]/cancel. A separate
// schema (not folded into bookingSchema) since it's the only path allowed
// to set cancelledAt/cancellationReason, and the reason is mandatory here
// (unlike every other free-text field in bookingSchema, which are optional).
export const bookingCancelSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to cancel a booking.").max(500, "Keep the reason under 500 characters."),
});

// Staff-side refund — POST /api/bookings/[id]/refund. Same shape/rationale
// as bookingCancelSchema: the only path allowed to set refundedAt/
// refundReason, reason always mandatory.
export const bookingRefundSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to mark a booking refunded.").max(500, "Keep the reason under 500 characters."),
});

export const unitSchema = z.object({
  name: z.string().min(1),
  unitNumber: z.string().min(1),
  shortName: z.string().min(1),
  location: z.string().optional(),
  nightlyRate: z.number().int().positive(),
  photoUrl: z.string().nullable().optional(),
  rating: z.number().min(0).max(5).optional(),
  active: z.boolean().optional(),
  ownerUserIds: z.array(z.string()).optional(),
  icalImportUrl: z.union([z.string().url(), z.literal("")]).nullable().optional(),
  // Guest Experience module — per-unit Digital Guidebook check-in details.
  wifiSsid: z.string().nullable().optional(),
  wifiPassword: z.string().nullable().optional(),
  doorCode: z.string().nullable().optional(),
  checkInInstructions: z.string().nullable().optional(),
  checkOutInstructions: z.string().nullable().optional(),
  videoTutorialUrl: z.union([z.string().url(), z.literal("")]).nullable().optional(),
  // Monthly Revenue Target override — null falls back to
  // Settings.monthlyRevenueTargetPerUnit, same as every other unit.
  monthlyRevenueTargetOverride: z.number().int().positive().nullable().optional(),
});

export const employeeSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER", "AUDITOR"]),
  payRateNote: z.string().nullable().optional(),
  // 0 = not yet set (the Prisma default for staff added before this field
  // existed) — the UI requires a positive value for brand-new hires, but the
  // API itself must accept 0 so saving one row doesn't fail on another.
  monthlySalary: z.number().int().nonnegative().optional(),
  salaryType: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
  salaryRate: z.number().int().nonnegative().optional(),
});

export const weeklyExpenseSchema = z.object({
  date: z.string().min(1),
  amount: z.number().int().positive(),
  note: z.string().min(1),
  targetEmployeeId: z.string().nullable().optional(),
  category: z.enum(["GENERAL", "TIKTOK_ADS"]).optional(),
});

export const expenseRequestSchema = z
  .object({
    date: z.string().min(1),
    amount: z.number().int().positive(),
    note: z.string().min(1),
    category: z.enum(["TIKTOK_ADS", "UNIT_EXPENSE"]),
    unitId: z.string().nullable().optional(),
    receiptUrl: z.string().nullable().optional(),
  })
  .refine((v) => v.category !== "UNIT_EXPENSE" || !!v.unitId, { message: "Pick a unit for a unit expense.", path: ["unitId"] });

export const expenseRequestReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().nullable().optional(),
});

export const payrollPaymentSchema = z.object({
  employeeId: z.string().min(1),
  periodStart: z.string().min(1),
  amount: z.number().int().nonnegative(),
  status: z.enum(["PENDING", "GIVEN"]),
});

export const employeeAchievementSchema = z.object({
  employeeId: z.string().min(1),
  label: z.string().min(1),
  threshold: z.number().int().positive(),
  rewardAmount: z.number().int().nonnegative().optional(),
  personalMessage: z.string().nullable().optional(),
});

export const calendarBlockSchema = z.object({
  unitId: z.string().min(1),
  type: z.enum(["Daycation", "Night", "Full", "Cleaning", "Maintenance"]),
  date: z.string().min(1),
  endDate: z.string().nullable().optional(),
  guest: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  avatarColor: z.string().optional(),
  avatarUrl: z.string().nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

export const userSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3).max(32).regex(/^[a-z0-9._]+$/, "Lowercase letters, numbers, dots and underscores only"),
  password: z.string().min(6).optional(),
  role: z.enum(["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER", "AUDITOR"]),
  ownedUnitIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  showOnGuestGuide: z.boolean().optional(),
});

export const billUpdateSchema = z.object({
  paid: z.boolean().optional(),
  amountDue: z.number().int().nonnegative().optional(),
  amountPaid: z.number().int().nonnegative().nullable().optional(),
  label: z.string().min(1).optional(),
  note: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  recurring: z.boolean().optional(),
});

export const billCreateSchema = z.object({
  unitId: z.string().min(1),
  label: z.string().min(1),
  amountDue: z.number().int().nonnegative(),
  month: z.string().min(1),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  recurring: z.boolean().optional(),
});

export const checklistGroupSchema = z.object({
  name: z.string().min(1),
  optional: z.boolean().optional(),
  items: z.array(z.string().min(1)).min(1),
  // Missing/empty = applies to every unit (the original, still-default
  // behavior) — present and non-empty scopes this group to just those units.
  unitIds: z.array(z.string()).optional(),
});

export const guidebookCategorySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().min(1),
  items: z.array(z.string().min(1)),
});

export const amenitySchema = z.object({
  icon: z.string().min(1),
  label: z.string().min(1),
});

export const emergencyContactSchema = z.object({
  name: z.string().min(1),
  phones: z.array(z.string().min(1)).min(1),
});

export const faqCategorySchema = z.object({
  category: z.string().min(1),
  items: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })),
});

export const settingsSchema = z.object({
  businessName: z.string().min(1),
  address: z.string().min(1),
  nightlyRate: z.number().int().positive(),
  dpFee: z.number().int().nonnegative(),
  checklistGroups: z.array(checklistGroupSchema).min(1).nullable().optional(),
  housekeepingDayRate: z.number().int().nonnegative().optional(),
  housekeepingNightBonus: z.number().int().nonnegative().optional(),
  bookerCommission: z.number().int().nonnegative().optional(),
  auditorWeeklyRate: z.number().int().nonnegative().optional(),
  weekdayRate12h: z.number().int().positive().optional(),
  weekdayRate21h: z.number().int().positive().optional(),
  weekendRate12h: z.number().int().positive().optional(),
  weekendRate21h: z.number().int().positive().optional(),
  weekdayNightPromoPct: z.number().int().min(0).max(100).optional(),
  dailyRevenueGoal: z.number().int().nonnegative().nullable().optional(),
  monthlyRevenueTargetPerUnit: z.number().int().positive().optional(),
  extensionFeePerHour: z.number().int().nonnegative().optional(),
  flexibleTimeFee: z.number().int().nonnegative().optional(),
  parkingCarRate: z.number().int().nonnegative().optional(),
  parkingMotorcycleRate: z.number().int().nonnegative().optional(),
  celebrationPackagePrice: z.number().int().nonnegative().optional(),
  batteryLowThresholdPct: z.number().int().min(0).max(100).optional(),
  batteryCriticalThresholdPct: z.number().int().min(0).max(100).optional(),
  // Property coordinates — the origin PlaceInsight distances are measured
  // from (see src/lib/places/). Latitude/longitude have real-world bounds,
  // unlike a generic float.
  propertyLat: z.number().min(-90).max(90).nullable().optional(),
  propertyLng: z.number().min(-180).max(180).nullable().optional(),
  // Guest Experience module
  contactPhone: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  messengerUsername: z.string().nullable().optional(),
  hostName: z.string().nullable().optional(),
  hostPhotoUrl: z.string().nullable().optional(),
  hostBio: z.string().nullable().optional(),
  // .nullable() as well as .optional() — GET /api/settings genuinely
  // returns null for any of these until an admin saves once (see
  // src/lib/prisma.ts's parse extension), and the natural client pattern is
  // "spread what GET gave me back into PATCH" — that null must be a valid
  // no-op, not a 500 from an unhandled ZodError.
  guidebookCategories: z.array(guidebookCategorySchema).nullable().optional(),
  amenities: z.array(amenitySchema).nullable().optional(),
  houseRules: z.array(z.string()).nullable().optional(),
  celebrationPackageItems: z.array(z.string()).nullable().optional(),
  emergencyContacts: z.array(emergencyContactSchema).nullable().optional(),
  staffContacts: z.array(emergencyContactSchema).nullable().optional(),
  faqs: z.array(faqCategorySchema).nullable().optional(),
});

export const auditFindingCreateSchema = z.object({
  auditorName: z.string().min(1),
  reviewDate: z.string().min(1),
  unitId: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  category: z.enum(["Cleaning", "Laundry", "Booking", "Irregularity", "Comms", "GuestExp", "Improvement"]),
  severity: z.enum(["Critical", "Warning", "Minor", "Positive"]),
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  recommendedAction: z.string().nullable().optional(),
  cleaningScore: z.number().min(0).max(10).nullable().optional(),
  laundryScore: z.number().min(0).max(10).nullable().optional(),
  bookerScore: z.number().min(0).max(10).nullable().optional(),
  overallStars: z.number().int().min(1).max(5).nullable().optional(),
  followUpNeeded: z.boolean().optional(),
  photoUrl: z.string().nullable().optional(),
});

export const auditFindingUpdateSchema = z.object({
  resolved: z.boolean().optional(),
  auditorName: z.string().min(1).optional(),
  reviewDate: z.string().min(1).optional(),
  unitId: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  category: z.enum(["Cleaning", "Laundry", "Booking", "Irregularity", "Comms", "GuestExp", "Improvement"]).optional(),
  severity: z.enum(["Critical", "Warning", "Minor", "Positive"]).optional(),
  title: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  recommendedAction: z.string().nullable().optional(),
  cleaningScore: z.number().min(0).max(10).nullable().optional(),
  laundryScore: z.number().min(0).max(10).nullable().optional(),
  bookerScore: z.number().min(0).max(10).nullable().optional(),
  overallStars: z.number().int().min(1).max(5).nullable().optional(),
  followUpNeeded: z.boolean().optional(),
  photoUrl: z.string().nullable().optional(),
});

// ── Laundry Management (part of Housekeeping) ──────────────────────────

export const LAUNDRY_STATUSES = ["Received", "Washing", "Drying", "Ironing", "Folding", "Ready for Pickup", "Delivered", "Cancelled"] as const;
export const LAUNDRY_PAYMENT_METHODS = ["Cash", "GCash", "BankTransfer", "Card", "OtherWallet"] as const;

export const laundryItemSchema = z.object({
  itemName: z.string().min(1, "Enter an item name."),
  category: z.string().min(1, "Enter a category."),
  quantity: z.number().int().min(1),
  weight: z.number().min(0).nullable().optional(),
  color: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  specialInstructions: z.string().nullable().optional(),
});

export const laundryOrderSchema = z.object({
  customerName: z.string().min(1, "Enter the customer's name."),
  roomNumber: z.string().nullable().optional(),
  unitId: z.string().nullable().optional(),
  contactNumber: z.string().min(7, "Enter a valid contact number."),
  dateReceived: z.string().min(1).refine(isValidDateString, "Invalid date received."),
  dueDate: z.string().min(1).refine(isValidDateString, "Invalid due date."),
  serviceId: z.string().min(1, "Select a service."),
  assignedStaffId: z.string().nullable().optional(),
  items: z.array(laundryItemSchema).min(1, "Add at least one item."),
  discountAmount: z.number().int().min(0).optional(),
  additionalCharges: z.number().int().min(0).optional(),
  taxAmount: z.number().int().min(0).optional(),
  // Staff can override the auto-computed total (see laundryPricing.ts) for
  // a negotiated/rounded price — same convention as Booking.amount.
  totalAmountOverride: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const laundryStatusUpdateSchema = z.object({
  status: z.enum(LAUNDRY_STATUSES),
  notes: z.string().nullable().optional(),
});

export const laundryPaymentSchema = z.object({
  amount: z.number().int().min(1, "Enter a payment amount."),
  method: z.enum(LAUNDRY_PAYMENT_METHODS),
  notes: z.string().nullable().optional(),
});

// Plain ZodObject (not wrapped in .refine) so PATCH /services/[id] can call
// .partial() on it — same reasoning as bookingSchema above. The "at least
// one price set" rule only makes sense on full create, so it's a separate
// .refine()-wrapped schema (laundryServiceSchema) rather than living here.
export const laundryServiceBaseSchema = z.object({
  name: z.string().min(1, "Enter a service name."),
  description: z.string().nullable().optional(),
  pricePerKg: z.number().int().min(0).nullable().optional(),
  pricePerItem: z.number().int().min(0).nullable().optional(),
  estimatedTurnaroundHours: z.number().int().min(1).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const laundryServiceSchema = laundryServiceBaseSchema.refine((v) => (v.pricePerKg ?? 0) > 0 || (v.pricePerItem ?? 0) > 0, {
  message: "Set a price per kilogram or per item (or both).",
  path: ["pricePerKg"],
});
