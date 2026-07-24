"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearQueuedMutations } from "@/lib/offlineQueue";
import { useEffect, useState } from "react";
import { visibleNavItems, ROLE_LABEL } from "@/lib/constants";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VIEW_MODE_COOKIE, type ViewMode } from "@/lib/viewModeCookie";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useAvatar } from "@/components/profile/AvatarProvider";
import { GridIcon, FileIcon, HomeIcon, CalendarIcon, SearchIcon, SettingsIcon, WalletIcon, ChartIcon, MoonIcon, SunIcon, LogoutIcon, UserIcon, ChevronDownIcon, BellIcon } from "@/components/ui/Icons";

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
};

export function Navbar({ viewMode }: { viewMode: ViewMode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { avatarUrl, name: liveName } = useAvatar();
  const displayName = liveName ?? session?.user?.name ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [guestUnread, setGuestUnread] = useState(0);

  // An employee who's switched to Travel Mode sees the same guest-facing
  // nav as an actual anonymous visitor — their staff session is fully
  // intact underneath (see src/lib/viewMode.ts), this only changes what
  // renders here and what src/app/page.tsx shows for "/".
  const isStaffNav = !!session && viewMode === "staff";

  // Fetched whenever staff nav isn't showing — covers both a true
  // anonymous guest and a staff member in Travel Mode. Harmless (returns
  // 0) for someone with no guest cookie either way.
  useEffect(() => {
    if (isStaffNav) return;
    fetch("/api/guest/notifications/unread-count").then((r) => r.json()).then((j) => setGuestUnread(j.count ?? 0)).catch(() => {});
  }, [isStaffNav, pathname]);

  const role = session?.user?.role;
  const items = visibleNavItems(role);
  const primaryItems = items.slice(0, PRIMARY_NAV_COUNT);
  const moreItems = items.slice(PRIMARY_NAV_COUNT);
  const onMoreItem = moreItems.some((item) => pathname.startsWith(item.href));

  // Close the "More" dropdown on route change so it never lingers open.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  function switchMode(mode: ViewMode) {
    document.cookie = `${VIEW_MODE_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setMenuOpen(false);
    router.push(mode === "travel" ? "/" : "/dashboard");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--nav-bg)] backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <Link href={isStaffNav ? "/dashboard" : "/"} className="flex flex-none items-center gap-2 font-extrabold text-rausch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.jpg" alt="Evangelina's Staycation" className="h-8 w-8 rounded-lg object-cover" />
          <span className="hidden text-[16px] tracking-tight sm:inline">Evangelina&rsquo;s Staycation</span>
        </Link>

        {!isStaffNav && (
          <div className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
            <Link href="/" className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-[var(--gray)] transition hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">Explore</Link>
            <Link href="/my-bookings" className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-[var(--gray)] transition hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">My bookings</Link>
            {session && (
              <span className="ml-1 rounded-full bg-rausch/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-rausch">Travel mode</span>
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
                    on ? "bg-rausch/10 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {moreItems.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className={cn(
                    "flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition",
                    onMoreItem ? "bg-rausch/10 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
                  )}
                >
                  <span>More</span>
                  <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
                </button>
                {moreOpen && (
                  <div className="absolute left-0 top-[42px] w-48 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card">
                    {moreItems.map((item) => {
                      const Icon = ICONS[item.icon];
                      const on = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition",
                            on ? "bg-rausch/10 text-rausch" : "text-[var(--ink)] hover:bg-[var(--bg-2)]"
                          )}
                        >
                          <Icon className="h-4 w-4 flex-none" /> {item.label}
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

          <button onClick={toggle} className="btn-icon" aria-label="Toggle theme">
            {theme === "dark" ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
          </button>

          {session && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
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
                <div className="absolute right-0 top-[46px] w-48 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card">
                  <div className="px-3 py-2 text-[12px] text-[var(--gray)] sm:hidden">{displayName} · {ROLE_LABEL[session.user.role]}</div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
                  >
                    <UserIcon className="h-4 w-4" /> Profile
                  </Link>
                  {/* Employee-only mode switch — staying logged in, just
                      swapping which experience renders (see viewMode.ts). */}
                  <button
                    onClick={() => switchMode(isStaffNav ? "travel" : "staff")}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
                  >
                    <HomeIcon className="h-4 w-4" /> {isStaffNav ? "Switch to Travel mode" : "Switch to Staff mode"}
                  </button>
                  <button
                    onClick={() => { clearQueuedMutations().catch(() => {}); signOut({ callbackUrl: "/login" }); }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
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
