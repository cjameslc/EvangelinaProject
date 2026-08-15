import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import { requireUser } from "@/lib/session";

// TEMPORARY, one-time-use route — runs the AccessCredential schema
// migration (see docs/Maintenance.md#schema-changes: this project has no
// Prisma migration history, schema changes are hand-written scripts) using
// the app's own runtime DATABASE_URL/TURSO_AUTH_TOKEN, guaranteeing it hits
// whichever database this exact deployment actually uses — unlike a local
// script pointed at a possibly-stale .env.local. Idempotent (every
// statement is IF NOT EXISTS / guarded), so safe to call more than once.
// Admin-session gated rather than a shared secret — simpler than having to
// know each environment's own CRON_SECRET value (which, unlike this login,
// isn't something an admin can just type in). Delete this route once the
// migration has been confirmed applied to both environments.
export async function POST(_req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  void user;

  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
  const log: string[] = [];

  try {
    const tables = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'access_credentials';`);
    if (tables.rows.length > 0) {
      log.push("access_credentials already exists — skipping create");
    } else {
      await client.execute(`
        CREATE TABLE access_credentials (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          unitId TEXT NOT NULL,
          bookingId TEXT,
          guestId TEXT,
          code TEXT NOT NULL,
          source TEXT NOT NULL,
          ttlockKeyboardPwdId INTEGER,
          reserveCodeId TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          validFrom DATETIME,
          validUntil DATETIME,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          createdByUserId TEXT,
          revokedAt DATETIME,
          revokedByUserId TEXT,
          reason TEXT,
          CONSTRAINT access_credentials_unitId_fkey FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT access_credentials_bookingId_fkey FOREIGN KEY (bookingId) REFERENCES bookings(id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT access_credentials_createdByUserId_fkey FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT access_credentials_revokedByUserId_fkey FOREIGN KEY (revokedByUserId) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);
      await client.execute(`CREATE INDEX access_credentials_bookingId_idx ON access_credentials(bookingId);`);
      await client.execute(`CREATE INDEX access_credentials_unitId_status_idx ON access_credentials(unitId, status);`);
      await client.execute(`CREATE INDEX access_credentials_createdAt_idx ON access_credentials(createdAt);`);
      log.push("created access_credentials + indexes");
    }

    const fallbackLogTable = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'ttlock_fallback_logs';`);
    if (fallbackLogTable.rows.length > 0) {
      await client.execute(`DROP TABLE ttlock_fallback_logs;`);
      log.push("dropped ttlock_fallback_logs");
    } else {
      log.push("ttlock_fallback_logs already gone — skipping");
    }

    const bookingCols = (await client.execute(`PRAGMA table_info(bookings);`)).rows.map((r) => String(r.name));
    for (const col of ["accessCode", "accessCodeSource", "accessCodeKeyboardPwdId", "accessCodeAssignedAt"]) {
      if (bookingCols.includes(col)) {
        await client.execute(`ALTER TABLE bookings DROP COLUMN ${col};`);
        log.push(`dropped bookings.${col}`);
      } else {
        log.push(`bookings.${col} already gone — skipping`);
      }
    }

    // --- Housekeeping Workforce Management additions ---

    const credCols = (await client.execute(`PRAGMA table_info(access_credentials);`)).rows.map((r) => String(r.name));
    if (!credCols.includes("cleaningLogId")) {
      await client.execute(`ALTER TABLE access_credentials ADD COLUMN cleaningLogId TEXT REFERENCES cleaning_logs(id) ON DELETE SET NULL ON UPDATE CASCADE;`);
      await client.execute(`CREATE UNIQUE INDEX access_credentials_cleaningLogId_key ON access_credentials(cleaningLogId);`);
      log.push("added access_credentials.cleaningLogId + unique index");
    } else {
      log.push("access_credentials.cleaningLogId already present — skipping");
    }
    if (!credCols.includes("assignedEmployeeId")) {
      await client.execute(`ALTER TABLE access_credentials ADD COLUMN assignedEmployeeId TEXT REFERENCES employees(id) ON DELETE SET NULL ON UPDATE CASCADE;`);
      await client.execute(`CREATE INDEX access_credentials_assignedEmployeeId_status_idx ON access_credentials(assignedEmployeeId, status);`);
      log.push("added access_credentials.assignedEmployeeId + index");
    } else {
      log.push("access_credentials.assignedEmployeeId already present — skipping");
    }

    const hkStateCols = (await client.execute(`PRAGMA table_info(housekeeping_unit_state);`)).rows.map((r) => String(r.name));
    if (!hkStateCols.includes("overdueNotifiedAt")) {
      await client.execute(`ALTER TABLE housekeeping_unit_state ADD COLUMN overdueNotifiedAt DATETIME;`);
      log.push("added housekeeping_unit_state.overdueNotifiedAt");
    } else {
      log.push("housekeeping_unit_state.overdueNotifiedAt already present — skipping");
    }

    const shiftCols = (await client.execute(`PRAGMA table_info(shifts);`)).rows.map((r) => String(r.name));
    if (!shiftCols.includes("logoutReason")) {
      await client.execute(`ALTER TABLE shifts ADD COLUMN logoutReason TEXT;`);
      log.push("added shifts.logoutReason");
    } else {
      log.push("shifts.logoutReason already present — skipping");
    }

    const staffNotifTable = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'staff_notifications';`);
    if (staffNotifTable.rows.length > 0) {
      log.push("staff_notifications already exists — skipping create");
    } else {
      await client.execute(`
        CREATE TABLE staff_notifications (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          unitId TEXT,
          bookingId TEXT,
          read BOOLEAN NOT NULL DEFAULT false,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT staff_notifications_userId_fkey FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await client.execute(`CREATE INDEX staff_notifications_userId_createdAt_idx ON staff_notifications(userId, createdAt);`);
      await client.execute(`CREATE INDEX staff_notifications_userId_read_idx ON staff_notifications(userId, read);`);
      log.push("created staff_notifications + indexes");
    }

    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, log, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
