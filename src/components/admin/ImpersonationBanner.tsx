"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { ROLE_LABEL } from "@/lib/constants";
import { useImpersonation } from "@/lib/impersonation";
import { LogoutIcon } from "@/components/ui/Icons";

/**
 * Sticky, always-on-top banner shown on every page for the duration of an
 * impersonation session — the one UI element that makes it impossible to
 * mistake this for a real login as the target user. Deliberately not
 * dismissible: the only way it goes away is actually ending the session.
 * Its amber/black scheme is intentionally unlike this app's rausch-pink
 * brand color everywhere else, so it can't be mistaken for a normal banner.
 */
export function ImpersonationBanner() {
  const { data: session } = useSession();
  const { stopImpersonation, stopping } = useImpersonation();
  const [ending, setEnding] = useState(false);

  if (!session?.user?.impersonating) return null;

  async function handleReturn() {
    setEnding(true);
    await stopImpersonation();
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gradient-to-r from-[#F59E0B] to-[#EA580C] px-4 py-2 text-center text-white shadow-md">
      <span className="text-[12.5px] font-extrabold uppercase tracking-wide">🎭 Impersonation Mode</span>
      <span className="text-[12.5px]">
        Viewing as <span className="font-bold">{session.user.name}</span>
        <span className="mx-1 opacity-70">·</span>
        <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-bold">{ROLE_LABEL[session.user.role] ?? session.user.role}</span>
      </span>
      <span className="hidden text-[11.5px] opacity-90 sm:inline">Actions are performed using this user&rsquo;s permissions.</span>
      <button
        onClick={handleReturn}
        disabled={stopping || ending}
        className="ml-1 flex items-center gap-1.5 rounded-full bg-black/90 px-3 py-1 text-[12px] font-bold text-white transition hover:bg-black disabled:opacity-60"
      >
        <LogoutIcon className="h-3.5 w-3.5" />
        {stopping || ending ? "Returning…" : "Return to My Account"}
      </button>
    </div>
  );
}
