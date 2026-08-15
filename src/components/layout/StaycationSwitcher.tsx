"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { useStaycationSwitch } from "@/lib/staycationSwitch";
import { ChevronDownIcon, CheckIcon } from "@/components/ui/Icons";
import { ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type StaycationOption = { ownerId: string; businessName: string; logoUrl: string | null; role: string; active: boolean };

/**
 * Multi-staycation switcher — only ever renders for a signed-in staff
 * member with more than one authorized property (see GET /api/staycations,
 * backed by the OwnerAccess table). A user with just the one — the
 * overwhelming majority today — sees nothing extra here at all; there's
 * nothing for them to switch to, so a dropdown with a single, unselectable
 * option would be clutter, not a feature.
 */
export function StaycationSwitcher() {
  const { data: session } = useSession();
  const toast = useToast();
  const { switchStaycation, switching } = useStaycationSwitch();
  const [options, setOptions] = useState<StaycationOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user) { setOptions(null); return; }
    const controller = new AbortController();
    fetch("/api/staycations", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setOptions(Array.isArray(j) ? j : []))
      .catch(() => {});
    return () => controller.abort();
    // Re-fetch on id/ownerId change only (login/impersonate/switch), not on
    // every session object re-render — this endpoint doesn't otherwise
    // depend on anything else in `session`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, session?.user?.ownerId]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!session?.user || !options || options.length < 2) return null;

  const active = options.find((o) => o.active) ?? options[0];
  // Mirrors /dashboard/consolidated's own eligibility check exactly (role
  // OWNER_ADMIN or CO_OWNER at 2+ properties) — only show the link when it
  // would actually work, rather than showing it to everyone and letting
  // the page silently redirect ineligible roles back to /dashboard.
  const consolidatedEligible = options.filter((o) => o.role === "OWNER_ADMIN" || o.role === "CO_OWNER").length >= 2;

  async function pick(ownerId: string) {
    if (ownerId === active.ownerId) { setOpen(false); return; }
    setOpen(false);
    const result = await switchStaycation(ownerId);
    if (!result.ok) toast(result.error ?? "Couldn't switch staycations.", true);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Switch staycation"
        className="flex max-w-[160px] items-center gap-1.5 rounded-full border border-[var(--line-2)] bg-[var(--card)] py-1.5 pl-3 pr-2.5 text-[12.5px] font-bold text-[var(--ink)] shadow-s disabled:opacity-60 sm:max-w-[200px]"
      >
        {active.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.logoUrl} alt="" className="h-5 w-5 flex-none rounded-full object-cover" />
        ) : (
          <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[10px]">🏨</span>
        )}
        <span className="truncate">{switching ? "Switching…" : active.businessName}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 flex-none text-[var(--gray)]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[42px] w-64 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-pop-in">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Staycations</div>
          {options.map((o) => (
            <button
              key={o.ownerId}
              role="menuitem"
              onClick={() => pick(o.ownerId)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--skin-primary,#6c5ce7)]/40"
            >
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logoUrl} alt="" className="h-7 w-7 flex-none rounded-full object-cover" />
              ) : (
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[13px]">🏨</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.businessName}</span>
                <span className="block text-[11px] font-semibold text-[var(--gray)]">{ROLE_LABEL[o.role as keyof typeof ROLE_LABEL] ?? o.role}</span>
              </span>
              {o.ownerId === active.ownerId && <CheckIcon className="h-4 w-4 flex-none text-[var(--skin-primary,#6c5ce7)]" />}
            </button>
          ))}
          {consolidatedEligible && (
            <>
              <div className="my-1 border-t border-[var(--line)]" />
              <Link
                href="/dashboard/consolidated"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[color:var(--skin-primary,#6c5ce7)] hover:bg-[var(--bg-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--skin-primary,#6c5ce7)]/40"
              >
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[color:var(--skin-primary,#6c5ce7)]/10 text-[13px]">📊</span>
                View all staycations combined
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
