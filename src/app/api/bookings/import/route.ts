import { NextRequest, NextResponse } from "next/server";
import { requireUser, logAudit } from "@/lib/session";
import { canEditBookings } from "@/lib/rbac";
import { parseImportFile, importBookingRows, IMPORT_MAX_BYTES } from "@/lib/bookingImport";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) return new Response("Forbidden", { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return NextResponse.json({ error: "File is too large — the limit is 20MB." }, { status: 400 });
  }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return NextResponse.json({ error: "Unsupported file type — upload a .xlsx, .xls, or .csv file." }, { status: 400 });
  }

  let rows;
  try {
    const buffer = await file.arrayBuffer();
    rows = parseImportFile(buffer);
  } catch {
    return NextResponse.json({ error: "Couldn't read that file — make sure it's a valid Excel or CSV export." }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found. Check the file has a header row plus at least one booking below it." }, { status: 400 });
  }
  if (rows.length > 2000) {
    return NextResponse.json({ error: "Too many rows in one file (max 2000) — split it into smaller batches." }, { status: 400 });
  }

  const summary = await importBookingRows(user, rows);

  await logAudit(user.id, "booking.import", "Booking", "bulk", {
    fileName: file.name,
    totalRows: summary.totalRows,
    created: summary.created,
    skipped: summary.skipped,
  });

  return NextResponse.json(summary);
}
