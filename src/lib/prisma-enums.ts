// Plain TypeScript union types standing in for what used to be native Prisma
// enums. SQLite/libSQL (via Prisma's driver-adapters preview, this Prisma
// version) has no enum support, so schema.prisma stores these as plain
// String columns now — validity is enforced at the application layer
// (Zod schemas, these types) instead of the database. Keep in sync with
// schema.prisma's column comments if a value set ever changes.

export type Role = "OWNER_ADMIN" | "CO_OWNER" | "HOUSEKEEPING" | "BOOKER" | "AUDITOR";
export type SalaryType = "DAILY" | "WEEKLY" | "MONTHLY";
export type StayType = "Daycation" | "Night" | "Full" | "Cleaning" | "Maintenance";
export type Platform = "Airbnb" | "TikTok" | "Facebook" | "WalkIn" | "Direct" | "Other";
export type FindingCategory = "Cleaning" | "Laundry" | "Booking" | "Irregularity" | "Comms" | "GuestExp" | "Improvement";
export type FindingSeverity = "Critical" | "Warning" | "Minor" | "Positive";
export type ExpenseCategory = "Amortization" | "Utilities" | "Water" | "Internet" | "AssociationDues" | "Streaming";
