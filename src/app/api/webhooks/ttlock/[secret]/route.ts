import { NextRequest, NextResponse } from "next/server";

// TTLock Open Platform "Lock Records Notify" callback — set this route's full
// URL (including the secret segment) as the Callback URL on the application's
// detail page in the TTLock Management Center (open.ttlock.com/manager).
// TTLock then POSTs here in real time whenever a gateway/WiFi lock uploads a
// new unlock/lock record, for every lock whose administrator has authorized
// this app's clientId.
//
// TTLock's push has no signing header or auth token of its own — the secret
// path segment is what stops a stranger from POSTing fake records, same
// pattern as CRON_SECRET on /api/ical/cron, just carried in the path instead
// of a header since TTLock's callback config is a bare URL with no custom
// headers option.
//
// Body is application/x-www-form-urlencoded: notifyType, lockId, lockMac,
// admin, and records (a JSON-encoded array string, decoded below). Logged
// only for now — wire this into a real UnlockRecord table (and surface it on
// the guest e-key / staff access-log UI) once that feature is designed.
//
// Response contract: TTLock expects the literal raw string "success" in the
// body, not JSON — anything else is treated as a failed delivery and retried.
export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!process.env.TTLOCK_CALLBACK_SECRET || secret !== process.env.TTLOCK_CALLBACK_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return new NextResponse("success");

  const notifyType = form.get("notifyType");
  const lockId = form.get("lockId");
  const lockMac = form.get("lockMac");
  const admin = form.get("admin");
  const rawRecords = form.get("records");

  let records: unknown = null;
  if (typeof rawRecords === "string") {
    try {
      records = JSON.parse(rawRecords);
    } catch {
      records = rawRecords;
    }
  }

  // eslint-disable-next-line no-console
  console.log("[ttlock.callback]", JSON.stringify({ notifyType, lockId, lockMac, admin, records }));

  // Always "success" — TTLock only cares that delivery succeeded, not what
  // (if anything) was done with it. Any other response makes it retry.
  return new NextResponse("success");
}
