"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearQueuedMutations } from "@/lib/offlineQueue";
import { useEffect, useRef, useState } from "react";
import { visibleNavItems, ROLE_LABEL } from "@/lib/constants";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/components/layout/ViewModeProvider";
import type { ViewMode } from "@/lib/viewModeCookie";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useColorTheme } from "@/components/ui/ColorThemeProvider";
import { useAvatar } from "@/components/profile/AvatarProvider";
import { StaycationSwitcher } from "@/components/layout/StaycationSwitcher";
import { GridIcon, FileIcon, HomeIcon, CalendarIcon, SearchIcon, SettingsIcon, WalletIcon, ChartIcon, MoonIcon, SunIcon, LogoutIcon, UserIcon, ChevronDownIcon, BellIcon, MegaphoneIcon, TrophyIcon } from "@/components/ui/Icons";

// How many role-visible nav items fit inline before the rest collapse into
// a "More" dropdown — chosen from real measurement: a role seeing all 7
// items (Owner/Admin) was truncating "Admin" to "Ad" at 1440px and hiding
// Auditor/Admin off-screen entirely (in a silent, non-obvious overflow-x
// scroll) at 1024px. Roles with 4 or fewer visible items (Housekeeping,
// Booker, Auditor) never hit this cap, so nothing changes for them — My
// Earnings in particular stays a primary, one-click tab for actual staff,
// and only gets folded into "More" for Owner/Admin and Co-owner, who don't
// have payroll of their own to check there anyway.
export const PRIMARY_NAV_COUNT = 4;

export const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  grid: GridIcon,
  file: FileIcon,
  home: HomeIcon,
  calendar: CalendarIcon,
  search: SearchIcon,
  settings: SettingsIcon,
  wallet: WalletIcon,
  chart: ChartIcon,
  megaphone: MegaphoneIcon,
  trophy: TrophyIcon,
};

export function Navbar() {
  const { viewMode, setViewMode } = useViewMode();
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { colorTheme } = useColorTheme();
  const { avatarUrl, name: liveName } = useAvatar();
  const displayName = liveName ?? session?.user?.name ?? "";

  // A truly anonymous visitor has no staff session to read
  // ownerBusinessName/ownerLogoUrl from — but on /o/[ownerSlug]/... they
  // ARE browsing a specific real owner's guest site, so a small public
  // lookup fills in that owner's own branding instead of always defaulting
  // to Evangelina's (the same gap this page's own data-fetching had before
  // getOwnerBySlug was threaded through it).
  const ownerSlugFromPath = pathname?.match(/^\/o\/([^/]+)/)?.[1] ?? null;
  const [guestOwnerBrand, setGuestOwnerBrand] = useState<{ businessName: string; logoUrl: string | null } | null>(null);
  useEffect(() => {
    if (session || !ownerSlugFromPath) { setGuestOwnerBrand(null); return; }
    const controller = new AbortController();
    fetch(`/api/public/owner-brand?slug=${encodeURIComponent(ownerSlugFromPath)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setGuestOwnerBrand(j))
      .catch(() => {});
    return () => controller.abort();
  }, [session, ownerSlugFromPath]);

  // Falls back to the original static branding for a truly generic guest
  // page (no session, no /o/[ownerSlug] context) and for any owner who
  // hasn't set their own name/icon yet (Owner.businessName is always set at
  // creation time in practice, but logoUrl is commonly null until they
  // upload one — see Admin -> Settings -> Staycation Profile).
  const brandName = session?.user?.ownerBusinessName || guestOwnerBrand?.businessName || "Evangelina's Staycation";
  const brandLogoUrl = session?.user?.ownerLogoUrl || guestOwnerBrand?.logoUrl;
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [guestUnread, setGuestUnread] = useState(0);
  const [auditorOpenCount, setAuditorOpenCount] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // An employee who's switched to Travel Mode sees the same guest-facing
  // nav as an actual anonymous visitor — their staff session is fully
  // intact underneath (see src/lib/viewMode.ts), this only changes what
  // renders here and what src/app/page.tsx shows for "/".
  const isStaffNav = !!session && viewMode === "staff";

  // Fetched whenever staff nav isn't showing — covers both a true
  // anonymous guest and a staff member in Travel Mode. Harmless (returns
  // 0) for someone with no guest cookie either way. Aborted on every route
  // change (Navbar is mounted globally, so this effect re-runs on every
  // client-side navigation) — without this, a slower earlier response could
  // resolve after a newer one and briefly flash a stale unread count.
  useEffect(() => {
    if (isStaffNav) return;
    const controller = new AbortController();
    fetch("/api/guest/notifications/unread-count", { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => setGuestUnread(j.count ?? 0))
      .catch(() => {});
    return () => controller.abort();
  }, [isStaffNav, pathname]);


  const role = session?.user?.role;
  const items = visibleNavItems(role, session?.user?.additionalPageAccess, session?.user?.ownerEnabledModules);
  const primaryItems = items.slice(0, PRIMARY_NAV_COUNT);
  const moreItems = items.slice(PRIMARY_NAV_COUNT);
  const onMoreItem = moreItems.some((item) => pathname.startsWith(item.href));
  const activeMoreItem = moreItems.find((item) => pathname.startsWith(item.href));
  const canSeeAuditorTab = items.some((item) => item.href === "/auditor");

  // Open findings count for the Auditor row's badge — same lightweight
  // count-only endpoint pattern as chat/guest unread above. Not worth
  // polling for roles that don't even have an Auditor tab.
  useEffect(() => {
    if (!isStaffNav || !canSeeAuditorTab) return;
    const controller = new AbortController();
    fetch("/api/auditor-findings/open-count", { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => setAuditorOpenCount(j.count ?? 0))
      .catch(() => {});
    return () => controller.abort();
  }, [isStaffNav, canSeeAuditorTab, pathname]);

  // Close the "More" dropdown on route change so it never lingers open.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // Click-outside and Escape close both dropdowns — neither had this before
  // (route-change was the only way "More" ever closed), which is a real
  // keyboard/mouse UX gap for two menus that otherwise look and behave like
  // standard dropdowns.
  useEffect(() => {
    if (!moreOpen && !menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setMoreOpen(false); setMenuOpen(false); }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen, menuOpen]);

  function switchMode(mode: ViewMode) {
    setViewMode(mode);
    setMenuOpen(false);
    // A full browser navigation, not router.push — the destination page's
    // own server-side redirect (app/page.tsx's getViewMode() check) reads
    // the view-mode cookie fresh on request, but Next's client Router
    // Cache can replay an earlier cached navigation to the same path
    // (recorded back when the cookie said the opposite mode) instead of
    // hitting the server again, landing right back where you started as
    // if the click did nothing. Same class of bug already fixed this way
    // on the login page's post-auth redirect.
    window.location.href = mode === "travel" ? "/" : "/dashboard";
  }

  return (
    <nav className="z-40 border-b border-[var(--line)] bg-[var(--nav-bg)] backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <Link href={isStaffNav ? "/dashboard" : ownerSlugFromPath ? `/o/${ownerSlugFromPath}/book` : "/"} className="brand-text flex flex-none items-center gap-2 font-extrabold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brandLogoUrl || "/branding/logo.jpg"} alt={brandName} className="h-8 w-8 rounded-lg object-cover" />
          <span className="hidden text-[16px] tracking-tight sm:inline">{brandName}</span>
        </Link>

        {!isStaffNav && (
          <div className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
            <Link href={ownerSlugFromPath ? `/o/${ownerSlugFromPath}/book` : "/"} className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-[var(--gray)] transition hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">Explore</Link>
            <Link href="/my-bookings" className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-[var(--gray)] transition hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">My bookings</Link>
            {session && (
              <span className="brand-bg-subtle brand-text ml-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide">Travel mode</span>
            )}
          </div>
        )}

        {isStaffNav && (
          <div className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
            {primaryItems.map((item) => {
              const Icon = ICONS[item.icon];
              const on = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition",
                    on ? "brand-bg-subtle brand-text" : "text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
                  )}
                >
                  <span className="relative">
                    <Icon className="h-[15px] w-[15px]" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {moreItems.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  className={cn(
                    "flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition",
                    onMoreItem ? "brand-bg-subtle brand-text" : "text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
                  )}
                >
                  {/* Shows the current section once you're inside it (e.g. "My Earnings") instead of a static, un-informative "More" — the trigger doubles as a lightweight "you are here" indicator. */}
                  <span>{activeMoreItem?.label ?? "More"}</span>
                  {onMoreItem && auditorOpenCount > 0 && activeMoreItem?.href !== "/auditor" && (
                    <span className="grid h-[15px] min-w-[15px] place-items-center rounded-full bg-rausch px-[3px] text-[9px] font-extrabold text-white">
                      {auditorOpenCount > 99 ? "99+" : auditorOpenCount}
                    </span>
                  )}
                  <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
                </button>
                {moreOpen && (
                  <div role="menu" className="absolute left-0 top-[42px] w-64 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-pop-in">
                    {moreItems.map((item) => {
                      const Icon = ICONS[item.icon];
                      const on = pathname.startsWith(item.href);
                      const badge = item.href === "/auditor" ? auditorOpenCount : 0;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--skin-primary,#6c5ce7)]/40",
                            on ? "brand-bg-subtle" : "hover:bg-[var(--bg-2)]"
                          )}
                        >
                          <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg", on ? "brand-bg-subtle-15 brand-text" : "bg-[var(--bg-2)] text-[var(--gray)]")}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("flex items-center gap-1.5 text-sm font-semibold", on ? "brand-text" : "text-[var(--ink)]")}>
                              {item.label}
                              {badge > 0 && (
                                <span className="grid h-[15px] min-w-[15px] place-items-center rounded-full bg-rausch px-[3px] text-[9px] font-extrabold text-white">
                                  {badge > 99 ? "99+" : badge}
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11.5px] font-medium text-[var(--gray)]">{item.subtitle}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isStaffNav && (
            <Link href="/notifications" className="btn-icon relative" aria-label="Notifications">
              <BellIcon className="h-[18px] w-[18px]" />
              {guestUnread > 0 && (
                <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-rausch text-[9px] font-extrabold text-white">
                  {guestUnread > 9 ? "9+" : guestUnread}
                </span>
              )}
            </Link>
          )}
          {!session && (
            <Link href="/login" className="whitespace-nowrap text-[12.5px] font-semibold text-[var(--gray)] hover:text-[var(--ink)]">
              <span className="sm:hidden">Log in</span>
              <span className="hidden sm:inline">Employee login</span>
            </Link>
          )}

          {/* A personal Color Theme (Settings > Color Theme) is a complete,
              fixed palette — its own background/text CSS variables always
              win over .dark's, by design (see globals.css's own comment on
              why), so this toggle has nothing left to actually change while
              one is active. It used to stay fully clickable anyway with no
              indication why nothing happened; disabling it here and saying
              why is the fix, not silently leaving it inert. */}
          {isStaffNav && <StaycationSwitcher />}

          <button
            onClick={toggle}
            disabled={!!colorTheme}
            className="btn-icon disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Toggle theme"
            title={colorTheme ? "Your Color Theme sets a fixed palette — change it in Settings to use light/dark mode again." : undefined}
          >
            {theme === "dark" ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
          </button>

          {session && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full border border-[var(--line-2)] bg-[var(--card)] py-1.5 pl-3.5 pr-1.5 shadow-s"
              >
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-[12.5px] font-bold text-[var(--ink)]">{displayName}</span>
                  <span className="block text-[10.5px] font-semibold text-[var(--gray)]">{ROLE_LABEL[session.user.role]}</span>
                </span>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={displayName} className="h-[30px] w-[30px] rounded-full object-cover" />
                ) : (
                  <span
                    className="grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: session.user.avatarColor || "#FF385C" }}
                  >
                    {initials(displayName)}
                  </span>
                )}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-[46px] w-52 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-pop-in">
                  <div className="px-3 py-2 text-[12px] text-[var(--gray)] sm:hidden">{displayName} · {ROLE_LABEL[session.user.role]}</div>
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--skin-primary,#6c5ce7)]/40"
                  >
                    <UserIcon className="h-4 w-4" /> Profile
                  </Link>
                  {/* No "Notifications" item here for staff — /notifications is
                      guest-portal-only (getCurrentGuest()-backed); linking
                      staff there would show a "sign in as guest" prompt, not
                      a real staff notifications page. That page doesn't
                      exist yet — the closest today is the chat unread badge
                      already on the Chat/Bookings nav item, plus Dashboard's
                      "Needs your attention" panel. */}
                  {/* Employee-only mode switch — staying logged in, just
                      swapping which experience renders (see viewMode.ts). */}
                  <button
                    onClick={() => switchMode(isStaffNav ? "travel" : "staff")}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--skin-primary,#6c5ce7)]/40"
                  >
                    <HomeIcon className="h-4 w-4" /> {isStaffNav ? "Switch to Travel mode" : "Switch to Staff mode"}
                  </button>
                  {/* Platform Admin only (multi-owner brief) — James's own
                      day-to-day nav is otherwise identical to any other
                      owner's OWNER_ADMIN, this is the one addition on top. */}
                  {session.user.isPlatformAdmin && (
                    <Link
                      href="/platform"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--skin-primary,#6c5ce7)]/40"
                    >
                      <GridIcon className="h-4 w-4" /> Platform Admin
                    </Link>
                  )}
                  <div className="my-1 h-px bg-[var(--line)]" />
                  <button
                    onClick={() => { clearQueuedMutations().catch(() => {}); signOut({ callbackUrl: "/login" }); }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rausch hover:bg-rausch/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rausch/40"
                  >
                    <LogoutIcon className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
