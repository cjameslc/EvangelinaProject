import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

// Reuse the client (and the underlying libSQL connection) across hot
// reloads in dev so we don't open a fresh connection on every file save.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof makePrismaClient>;
  prismaPool?: ReturnType<typeof makePrismaClient>[];
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Stringifies a field on a Prisma write payload in place, if it's present and not already a string. */
function stringifyField(data: Record<string, any> | undefined, field: string) {
  if (data && field in data && data[field] !== undefined && data[field] !== null && typeof data[field] !== "string") {
    data[field] = JSON.stringify(data[field]);
  }
}

function makePrismaClient() {
  const libsql = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const adapter = new PrismaLibSQL(libsql);
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // SQLite/libSQL (via Prisma's driver-adapters preview, this Prisma
  // version) supports neither Json nor a native array column — these 5
  // fields are stored as plain JSON-encoded TEXT columns instead (see the
  // matching comments in schema.prisma). The `result` extensions below
  // parse them back into real arrays/objects on every read, with a typed
  // override — so the rest of the app reads `booking.guests` etc. as a
  // genuine string[]/object again, not the raw JSON string. The `query`
  // extensions handle the other direction: stringifying on create/update
  // so callers can keep passing a plain array/object exactly as before.
  return base
    .$extends({
      name: "json-string-fields:write",
      query: {
        booking: {
          create: ({ args, query }) => { stringifyField(args.data as any, "guests"); return query(args); },
          update: ({ args, query }) => { stringifyField(args.data as any, "guests"); return query(args); },
          updateMany: ({ args, query }) => { stringifyField(args.data as any, "guests"); return query(args); },
          upsert: ({ args, query }) => { stringifyField(args.create as any, "guests"); stringifyField(args.update as any, "guests"); return query(args); },
          createMany: ({ args, query }) => {
            const rows = Array.isArray(args.data) ? args.data : [args.data];
            rows.forEach((d: any) => stringifyField(d, "guests"));
            return query(args);
          },
        },
        housekeepingUnitState: {
          create: ({ args, query }) => { stringifyField(args.data as any, "checked"); stringifyField(args.data as any, "cleanedBookingIds"); return query(args); },
          update: ({ args, query }) => { stringifyField(args.data as any, "checked"); stringifyField(args.data as any, "cleanedBookingIds"); return query(args); },
          upsert: ({ args, query }) => {
            stringifyField(args.create as any, "checked"); stringifyField(args.create as any, "cleanedBookingIds");
            stringifyField(args.update as any, "checked"); stringifyField(args.update as any, "cleanedBookingIds");
            return query(args);
          },
        },
        settings: {
          update: ({ args, query }) => { stringifyField(args.data as any, "checklistGroups"); return query(args); },
          upsert: ({ args, query }) => { stringifyField(args.create as any, "checklistGroups"); stringifyField(args.update as any, "checklistGroups"); return query(args); },
        },
        auditLog: {
          create: ({ args, query }) => { stringifyField(args.data as any, "meta"); return query(args); },
        },
      },
    })
    .$extends({
      name: "json-string-fields:read",
      result: {
        booking: {
          guests: {
            needs: { guests: true },
            compute: (row): string[] => parseJson(row.guests, []),
          },
        },
        housekeepingUnitState: {
          checked: {
            needs: { checked: true },
            compute: (row): boolean[][] => parseJson(row.checked, []),
          },
          cleanedBookingIds: {
            needs: { cleanedBookingIds: true },
            compute: (row): string[] => parseJson(row.cleanedBookingIds, []),
          },
        },
        settings: {
          checklistGroups: {
            needs: { checklistGroups: true },
            compute: (row): unknown[] | null => (row.checklistGroups == null ? null : parseJson(row.checklistGroups, [])),
          },
        },
        auditLog: {
          meta: {
            needs: { meta: true },
            compute: (row): unknown => (row.meta == null ? null : parseJson(row.meta, null)),
          },
        },
      },
    });
}

export const prisma = globalForPrisma.prisma ?? makePrismaClient();

// @prisma/adapter-libsql serializes every query issued on a given client
// behind an internal mutex — so Promise.all-ing many independent reads
// through the single `prisma` client above still runs them one network
// round-trip at a time (measured ~2-3x slower, and up to 8x for larger fan
// -outs, vs spreading the same reads across separate client instances).
// Pages that fan out many independent reads in one Promise.all (Dashboard,
// Admin, Bookings) should pull from this pool instead — prismaPool[i %
// prismaPool.length] per query — to get real concurrency. Keep using
// `prisma` for everything else (writes, single reads, transactions).
const READ_POOL_SIZE = 13;
export const prismaPool: ReturnType<typeof makePrismaClient>[] = globalForPrisma.prismaPool ?? Array.from({ length: READ_POOL_SIZE }, () => makePrismaClient());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaPool = prismaPool;
}
