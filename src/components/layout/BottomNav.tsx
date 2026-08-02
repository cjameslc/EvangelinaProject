"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearQueuedMutations } from "@/lib/offlineQueue";
import { useEffect, useState } from "react";
import { visibleNavItems, ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/components/layout/ViewModeProvider";
import type { ViewMode } from "@/lib/viewModeCookie";
import { useTheme } from "@/components/ui/ThemeProvider";
import { ICONS, PRIMARY_NAV_COUNT } from "@/components/layout/Navbar";
import { MoonIcon, SunIcon, LogoutIcon, UserIcon, MoreIcon, CloseIcon, HomeIcon } from "@/components/ui/Icons";

// Mobile-only primary navigation, replacing the old hamburger dropdown-panel.
// Desktop keeps Navbar's top nav untouched. Shares NAV_ITEMS/role-filtering
// with Navbar via visibleNavItems() so the two surfaces can't drift.
export function BottomNav() {
  const { viewMode, setViewMode } = useViewMode();
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [auditorOpenCount, setAuditorOpenCount] = useState(0);

  useEffect(() => { setSheetOpen(false); }, [pathname]);

  // Escape closes the sheet — the backdrop already handles click/tap, this
  // adds keyboard/external-keyboard parity with Navbar's dropdowns.
  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setSheetOpen(false); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  // Same open-findings badge as Navbar's "More" menu — see
  // /api/auditor-findings/open-count for why this is its own lightweight
  // endpoint rather than reusing the full Auditor page query.
  useEffect(() => {
    if (!session || viewMode === "travel") return;
    if (!visibleNavItems(session.user?.role).some((i) => i.href === "/auditor")) return;
    const controller = new AbortController();
    fetch("/api/auditor-findings/open-count", { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => setAuditorOpenCount(j.count ?? 0))
      .catch(() => {});
    return () => controller.abort();
  }, [session, viewMode, pathname]);

  // Same lightweight badge fetch as Navbar (a sibling component — BottomNav
  // is staff-only, so it duplicates rather than shares that state, same as
  // it already independently re-renders NAV_ITEMS instead of importing
  // Navbar's rendering).
  useEffect(() => {
    if (!session || viewMode === "travel") return;
    let cancelled = false;
    let controller: AbortController | null = null;
    async function tick() {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/chat/unread-count", { signal: controller.signal });
        if (res.ok && !cancelled) setChatUnread((await res.json()).count ?? 0);
      } catch {
        // aborted or transient — next tick retries
      }
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); controller?.abort(); };
  }, [session, viewMode, pathname]);

  // Same as Navbar: an employee in Travel Mode sees no staff bottom nav,
  // matching what a real guest sees (no bottom nav at all today).
  if (!session || viewMode === "travel") return null;

  function switchMode(mode: ViewMode) {
    setViewMode(mode);
    setSheetOpen(false);
    // Full browser navigation, not router.push — see Navbar.tsx's
    // switchMode for why (Router Cache can replay a stale cached
    // navigation to "/" recorded under the old cookie value).
    window.location.href = mode === "travel" ? "/" : "/dashboard";
  }

  const role = session.user?.role;
  const items = visibleNavItems(role);
  const primaryItems = items.slice(0, PRIMARY_NAV_COUNT);
  const overflowItems = items.slice(PRIMARY_NAV_COUNT);
  const onOverflowItem = overflowItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--nav-bg)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-16 items-stretch">
          {primaryItems.map((item) => {
            const Icon = ICONS[item.icon];
            const on = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-bold",
                  on ? "text-rausch" : "text-[var(--gray)]"
                )}
              >
                <span className="relative">
                  <Icon className="h-[20px] w-[20px]" />
                  {(item.icon === "chat" || item.icon === "file") && chatUnread > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-[15px] min-w-[15px] animate-pop-in place-items-center rounded-full bg-rausch px-[3px] text-[9px] font-extrabold text-white">
                      {chatUnread > 99 ? "99+" : chatUnread}
                    </span>
                  )}
                </span>
                {item.label === "My Earnings" ? "Earnings" : item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="More"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-bold",
              onOverflowItem ? "text-rausch" : "text-[var(--gray)]"
            )}
          >
            <MoreIcon className="h-[20px] w-[20px]" />
            More
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-[var(--line)] bg-[var(--card)] p-2 pt-3 shadow-card"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--line-2)]" />
            <div className="flex items-center justify-between px-3 pb-1">
              <span className="text-[13px] font-bold text-[var(--gray)]">
                {session.user?.name} · {ROLE_LABEL[session.user.role]}
              </span>
              <button onClick={() => setSheetOpen(false)} className="btn-icon h-8 w-8" aria-label="Close">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {overflowItems.map((item) => {
              const Icon = ICONS[item.icon];
              const on = pathname.startsWith(item.href);
              const badge = item.href === "/auditor" ? auditorOpenCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 transition",
                    on ? "bg-rausch/10" : "hover:bg-[var(--bg-2)]"
                  )}
                >
                  <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", on ? "bg-rausch/15 text-rausch" : "bg-[var(--bg-2)] text-[var(--gray)]")}>
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("flex items-center gap-1.5 text-[14px] font-semibold", on ? "text-rausch" : "text-[var(--ink)]")}>
                      {item.label}
                      {badge > 0 && (
                        <span className="grid h-[16px] min-w-[16px] place-items-center rounded-full bg-rausch px-[3px] text-[9.5px] font-extrabold text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] font-medium text-[var(--gray)]">{item.subtitle}</span>
                  </span>
                </Link>
              );
            })}

            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
            >
              <UserIcon className="h-[17px] w-[17px] flex-none" /> Profile
            </Link>
            <button
              onClick={() => switchMode("travel")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
            >
              <HomeIcon className="h-[17px] w-[17px] flex-none" /> Switch to Travel mode
            </button>
            <button
              onClick={toggle}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
            >
              {theme === "dark" ? <SunIcon className="h-[17px] w-[17px] flex-none" /> : <MoonIcon className="h-[17px] w-[17px] flex-none" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button
              onClick={() => { clearQueuedMutations().catch(() => {}); signOut({ callbackUrl: "/login" }); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
            >
              <LogoutIcon className="h-[17px] w-[17px] flex-none" /> Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
