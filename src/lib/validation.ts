import { z } from "zod";

export const bookingSchema = z.object({
  unitId: z.string().min(1),
  date: z.string().min(1),
  checkOutDate: z.string().nullable().optional(),
  stayType: z.enum(["Daycation", "Night", "Full"]),
  checkInTime: z.string().nullable().optional(),
  checkOutTime: z.string().nullable().optional(),
  guests: z.array(z.string()).min(1),
  pax: z.number().int().positive().nullable().optional(),
  contactNumber: z.string().min(7),
  bookerId: z.string().nullable().optional(),
  cleanerId: z.string().nullable().optional(),
  platform: z.enum(["Airbnb", "Facebook", "TikTok", "Other"]),
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
});

export const unitSchema = z.object({
  name: z.string().min(1),
  unitNumber: z.string().min(1),
  shortName: z.string().min(1),
  location: z.string().optional(),
  nightlyRate: z.number().int().positive(),
  photoUrl: z.string().nullable().optional(),
  active: z.boolean().optional(),
  ownerUserIds: z.array(z.string()).optional(),
});

export const employeeSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER", "AUDITOR"]),
  payRateNote: z.string().nullable().optional(),
});

export const weeklyExpenseSchema = z.object({
  date: z.string().min(1),
  amount: z.number().int().positive(),
  note: z.string().min(1),
  targetEmployeeId: z.string().nullable().optional(),
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
  email: z.string().email().optional(),
  avatarColor: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

export const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER", "AUDITOR"]),
  ownedUnitIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const billUpdateSchema = z.object({
  paid: z.boolean().optional(),
  amountDue: z.number().int().nonnegative().optional(),
  amountPaid: z.number().int().nonnegative().nullable().optional(),
  label: z.string().min(1).optional(),
  note: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
});

export const billCreateSchema = z.object({
  unitId: z.string().min(1),
  label: z.string().min(1),
  amountDue: z.number().int().nonnegative(),
  month: z.string().min(1),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
});

export const checklistGroupSchema = z.object({
  name: z.string().min(1),
  optional: z.boolean().optional(),
  items: z.array(z.string().min(1)).min(1),
});

export const settingsSchema = z.object({
  businessName: z.string().min(1),
  address: z.string().min(1),
  nightlyRate: z.number().int().positive(),
  dpFee: z.number().int().nonnegative(),
  checklistGroups: z.array(checklistGroupSchema).min(1).optional(),
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
