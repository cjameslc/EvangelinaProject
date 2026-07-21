import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { bookingSchema } from "@/lib/validation";
import { createBookingRecord } from "@/lib/bookingService";

export const IMPORT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

export const IMPORT_TEMPLATE_HEADERS = [
  "Unit Number", "Check-in Date", "Check-out Date", "Stay Type", "Check-in Time", "Check-out Time",
  "Guest Name(s)", "Pax", "Contact Number", "Platform", "Platform Other", "Amount", "Paid", "Booker Name", "Cleaner Name",
] as const;

export const IMPORT_TEMPLATE_SAMPLE_ROW = [
  "1118", "2026-08-01", "2026-08-02", "Night", "14:00", "12:00",
  "Juan Dela Cruz", "2", "09171234567", "Direct", "", "1799", "Yes", "", "",
];

/** Every header this importer recognizes, mapped to a canonical key — matched case/space-insensitively so "unit number", "Unit_Number", "UNIT NO" (a few common synonyms) all resolve the same way. Unrecognized columns are ignored, not rejected, so an extra column in someone's sheet doesn't block the whole import. */
const HEADER_ALIASES: Record<string, string> = {
  "unitnumber": "unitNumber", "unit": "unitNumber", "unitno": "unitNumber", "unit#": "unitNumber",
  "checkindate": "checkInDate", "checkin": "checkInDate", "date": "checkInDate",
  "checkoutdate": "checkOutDate", "checkout": "checkOutDate",
  "staytype": "stayType", "type": "stayType",
  "checkintime": "checkInTime",
  "checkouttime": "checkOutTime",
  "guestnames": "guests", "guestname": "guests", "guest": "guests", "guests": "guests",
  "pax": "pax", "guestcount": "pax",
  "contactnumber": "contactNumber", "contact": "contactNumber", "phone": "contactNumber", "mobile": "contactNumber",
  "platform": "platform", "source": "platform",
  "platformother": "platformOther",
  "amount": "amount", "totalamount": "amount", "price": "amount",
  "paid": "paid", "ispaid": "paid", "status": "paid",
  "bookername": "bookerId", "booker": "bookerId",
  "cleanername": "cleanerId", "cleaner": "cleanerId", "housekeeper": "cleanerId",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9#]/g, "");
}

const STAY_TYPE_ALIASES: Record<string, string> = {
  daycation: "Daycation", day: "Daycation", "day-use": "Daycation", dayuse: "Daycation",
  night: "Night", "night-stay": "Night", nightstay: "Night", overnight: "Night",
  full: "Full", "21hour": "Full", "21-hour": "Full", fullstay: "Full", "full-stay": "Full",
};

const PLATFORM_ALIASES: Record<string, string> = {
  airbnb: "Airbnb", tiktok: "TikTok", facebook: "Facebook", fb: "Facebook",
  walkin: "WalkIn", "walk-in": "WalkIn", direct: "Direct", other: "Other",
};

export type ImportRowResult =
  | { row: number; status: "created"; bookingId: string; guest: string }
  | { row: number; status: "skipped"; reason: string; raw: Record<string, string> };

export type ImportSummary = {
  totalRows: number;
  created: number;
  skipped: number;
  results: ImportRowResult[];
};

/** Parses the uploaded workbook's first sheet into an array of {canonicalHeader: rawCellText} objects — every cell read as a display string (raw: false), so Excel serial dates and typed numbers all arrive pre-formatted and parsing them is the same whether the source was .xlsx, .xls, or .csv. */
export function parseImportFile(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (rows.length === 0) return [];

  const headerRow = rows[0].map((h) => normalizeHeader(String(h ?? "")));
  const canonicalHeaders = headerRow.map((h) => HEADER_ALIASES[h] ?? null);

  return rows.slice(1)
    .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      canonicalHeaders.forEach((key, i) => {
        if (key) obj[key] = String(r[i] ?? "").trim();
      });
      return obj;
    });
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // YYYY-MM-DD, already canonical.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YYYY.
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // Fallback: whatever the JS Date parser can make of it.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseTime(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.length === 4 ? `0${s}` : s;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  }
  return null;
}

/**
 * Validates and transforms one raw import row into the exact input the real
 * booking-creation service expects. Never builds a Prisma payload directly —
 * routing everything through bookingSchema + createBookingRecord is what
 * guarantees an imported booking is indistinguishable from a manually
 * entered one.
 */
async function transformRow(
  raw: Record<string, string>,
  unitsByNumber: Map<string, { id: string; nightlyRate: number }>,
  employeesByName: Map<string, string>
): Promise<{ ok: true; input: ReturnType<typeof bookingSchema.parse> } | { ok: false; reason: string }> {
  const unitNumber = (raw.unitNumber ?? "").trim();
  const unit = unitsByNumber.get(unitNumber.toLowerCase());
  if (!unit) return { ok: false, reason: `Unknown unit number "${unitNumber || "(blank)"}"` };

  const checkInDate = parseDate(raw.checkInDate);
  if (!checkInDate) return { ok: false, reason: `Invalid or missing check-in date "${raw.checkInDate || "(blank)"}"` };
  const checkOutDate = raw.checkOutDate ? parseDate(raw.checkOutDate) : null;
  if (raw.checkOutDate && !checkOutDate) return { ok: false, reason: `Invalid check-out date "${raw.checkOutDate}"` };

  const stayTypeKey = normalizeHeader(raw.stayType ?? "");
  const stayType = STAY_TYPE_ALIASES[stayTypeKey];
  if (!stayType) return { ok: false, reason: `Unrecognized stay type "${raw.stayType || "(blank)"}" — use Daycation, Night, or Full` };

  const guestsRaw = (raw.guests ?? "").trim();
  if (!guestsRaw) return { ok: false, reason: "Missing guest name(s)" };
  const guests = guestsRaw.split(/[,;]/).map((g) => g.trim()).filter(Boolean);

  const contactNumber = (raw.contactNumber ?? "").trim();
  if (contactNumber.length < 7) return { ok: false, reason: `Invalid or missing contact number "${contactNumber || "(blank)"}"` };

  const platformKey = normalizeHeader(raw.platform ?? "");
  const platform = PLATFORM_ALIASES[platformKey];
  if (!platform) return { ok: false, reason: `Unrecognized platform "${raw.platform || "(blank)"}" — use Airbnb, TikTok, Facebook, WalkIn, Direct, or Other` };

  const amountRaw = (raw.amount ?? "").replace(/[₱,\s]/g, "");
  const amount = amountRaw ? Math.round(Number(amountRaw)) : NaN;
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: `Invalid amount "${raw.amount || "(blank)"}"` };

  const paidRaw = normalizeHeader(raw.paid ?? "");
  const paid = ["yes", "true", "paid", "1"].includes(paidRaw);

  const pax = raw.pax ? parseInt(raw.pax, 10) : null;
  const checkInTime = parseTime(raw.checkInTime);
  const checkOutTime = parseTime(raw.checkOutTime);
  const bookerId = raw.bookerId ? employeesByName.get(raw.bookerId.trim().toLowerCase()) ?? null : null;
  const cleanerId = raw.cleanerId ? employeesByName.get(raw.cleanerId.trim().toLowerCase()) ?? null : null;

  const parsed = bookingSchema.safeParse({
    unitId: unit.id,
    date: checkInDate,
    checkOutDate,
    stayType,
    checkInTime,
    checkOutTime,
    guests,
    pax: pax && !Number.isNaN(pax) ? pax : null,
    contactNumber,
    bookerId,
    cleanerId,
    platform,
    platformOther: platform === "Other" ? (raw.platformOther || null) : null,
    dpAmount: null,
    dpReceivedById: null,
    dpMethod: null,
    dpProofUrl: null,
    amount,
    receivedById: bookerId,
    method: null,
    proofUrl: null,
    paid,
  });
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "Invalid row" };
  return { ok: true, input: parsed.data };
}

/**
 * Imports every row in a parsed sheet by calling createBookingRecord for
 * each one in turn — sequential, not parallel, because a row can conflict
 * with a booking created by an earlier row in the very same file, and the
 * overlap guard only catches that if each row sees the previous one's
 * result. A bad row is skipped with a reason, not fatal to the rest of the
 * import.
 */
export async function importBookingRows(user: { id: string; role: string; ownedUnitIds: string[] }, rawRows: Record<string, string>[]): Promise<ImportSummary> {
  const units = await prisma.unit.findMany({ select: { id: true, unitNumber: true, nightlyRate: true } });
  const unitsByNumber = new Map(units.map((u) => [u.unitNumber.toLowerCase(), { id: u.id, nightlyRate: u.nightlyRate }]));
  const employees = await prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true } });
  const employeesByName = new Map(employees.map((e) => [e.name.toLowerCase(), e.id]));

  const results: ImportRowResult[] = [];
  let created = 0, skipped = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // +1 for header row, +1 for 1-indexing
    const transformed = await transformRow(raw, unitsByNumber, employeesByName);
    if (!transformed.ok) {
      results.push({ row: rowNum, status: "skipped", reason: transformed.reason, raw });
      skipped++;
      continue;
    }
    const result = await createBookingRecord(user, transformed.input);
    if (!result.ok) {
      results.push({ row: rowNum, status: "skipped", reason: result.error, raw });
      skipped++;
      continue;
    }
    results.push({ row: rowNum, status: "created", bookingId: result.booking.id, guest: transformed.input.guests[0] ?? "Guest" });
    created++;
  }

  return { totalRows: rawRows.length, created, skipped, results };
}
