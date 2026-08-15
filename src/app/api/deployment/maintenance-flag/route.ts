import { NextResponse } from "next/server";
import { getCachedMaintenanceFlag } from "@/lib/deployment";

// No auth — this is a single non-sensitive boolean, and src/middleware.ts
// (edge runtime, no session cookie forwarding set up for internal fetches)
// needs to reach it before it even knows who the requester is.
//
// force-dynamic: no cookies()/headers() call here for Next to infer dynamic
// rendering from, so without this the route gets statically optimized —
// its JSON response frozen at BUILD time and served unchanged to every
// request forever, silently breaking the whole maintenance-mode feature
// (it'd always report whatever the flag was during the last deploy). The
// actual caching this route needs comes from getCachedMaintenanceFlag's own
// unstable_cache (15s) plus middleware's fetch-level revalidate, not from
// Next's route-level static optimization.
export const dynamic = "force-dynamic";

export async function GET() {
  const active = await getCachedMaintenanceFlag();
  return NextResponse.json({ active });
}
