"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

// Spec section 1 — Housekeeping-only, mounted once from HousekeepingView
// for role === "HOUSEKEEPING". No server-push/cron exists to force this
// (see docs/Maintenance.md's cron-slot discipline) — enforced client-side
// while the tab is open (a warning at 18:50, sign-out at 19:00 Manila) via
// this timer, with the "let an active clean finish" carve-out checked
// against isCleaning. A housekeeper who never has the app open past 7PM
// simply gets asked to sign back in the next time they open it — the same
// practical effect, since there's no permanent session to revoke anyway
// (see src/middleware.ts's existing forced-password-change redirect for
// the one other place this app already does a client-triggered gate like
// this).
const WARNING_MINUTES_BEFORE = 10;

function manilaNow(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => iso.find((p) => p.type === t)?.value ?? "00";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

export function AutoLogoutGuard({ isCleaning, hasOpenShift }: { isCleaning: boolean; hasOpenShift: boolean }) {
  const [minutesToLogout, setMinutesToLogout] = useState<number | null>(null);

  useEffect(() => {
    if (!hasOpenShift) return;

    function tick() {
      const now = manilaNow();
      const logoutAt = new Date(now);
      logoutAt.setHours(19, 0, 0, 0);
      const msUntil = logoutAt.getTime() - now.getTime();
      const minsUntil = Math.round(msUntil / 60000);

      if (minsUntil <= 0) {
        // Past 7PM — allow an active clean to finish (spec section 1), sign
        // out the moment it's not (checked again next tick, once per minute).
        if (!isCleaning) {
          fetch("/api/housekeeping/shift", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "Scheduled Logout" }),
          }).finally(() => signOut({ callbackUrl: "/login" }));
        }
        setMinutesToLogout(0);
      } else if (minsUntil <= WARNING_MINUTES_BEFORE) {
        setMinutesToLogout(minsUntil);
      } else {
        setMinutesToLogout(null);
      }
    }

    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [isCleaning, hasOpenShift]);

  if (minutesToLogout === null) return null;

  return (
    <div className="mb-5 rounded-xl border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-amber">
      {minutesToLogout > 0
        ? `You'll be signed out at 7:00 PM (in ${minutesToLogout} min).`
        : isCleaning
          ? "Your shift has ended — you'll be signed out once you finish this clean."
          : "Signing you out for the day…"}
    </div>
  );
}
