"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { NAV_ITEMS, ROLE_LABEL } from "@/lib/constants";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useAvatar } from "@/components/profile/AvatarProvider";
import { GridIcon, FileIcon, HomeIcon, CalendarIcon, SearchIcon, SettingsIcon, MoonIcon, SunIcon, LogoutIcon, MenuIcon, CloseIcon, UserIcon } from "@/components/ui/Icons";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  grid: GridIcon,
  file: FileIcon,
  home: HomeIcon,
  calendar: CalendarIcon,
  search: SearchIcon,
  settings: SettingsIcon,
};

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { avatarUrl } = useAvatar();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const role = session?.user?.role;
  const items = NAV_ITEMS.filter((i) => role === "OWNER_ADMIN" || (role && i.roles.includes(role)));

  // Close the mobile nav panel on route change so it never lingers open.
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--nav-bg)] backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        <Link href="/dashboard" className="flex flex-none items-center gap-2 font-extrabold text-rausch">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.jpg" alt="Evangelina's Staycation" className="h-8 w-8 rounded-lg object-cover" />
          <span className="hidden text-[16px] tracking-tight sm:inline">Evangelina&rsquo;s Staycation</span>
        </Link>

        {session && (
          <div className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
            {items.map((item) => {
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
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {session && (
            <button onClick={() => setNavOpen((v) => !v)} className="btn-icon md:hidden" aria-label="Toggle menu" aria-expanded={navOpen}>
              {navOpen ? <CloseIcon className="h-[18px] w-[18px]" /> : <MenuIcon className="h-[18px] w-[18px]" />}
            </button>
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
                  <span className="block text-[12.5px] font-bold text-[var(--ink)]">{session.user.name}</span>
                  <span className="block text-[10.5px] font-semibold text-[var(--gray)]">{ROLE_LABEL[session.user.role]}</span>
                </span>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={session.user.name} className="h-[30px] w-[30px] rounded-full object-cover" />
                ) : (
                  <span
                    className="grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: session.user.avatarColor || "#FF385C" }}
                  >
                    {initials(session.user.name)}
                  </span>
                )}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-[46px] w-48 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card">
                  <div className="px-3 py-2 text-[12px] text-[var(--gray)] sm:hidden">{session.user.name} · {ROLE_LABEL[session.user.role]}</div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-2)]"
                  >
                    <UserIcon className="h-4 w-4" /> Profile
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
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

      {session && navOpen && (
        <div className="border-t border-[var(--line)] bg-[var(--card)] px-3 py-2 md:hidden">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const on = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold transition",
                  on ? "bg-rausch/10 text-rausch" : "text-[var(--ink)] hover:bg-[var(--bg-2)]"
                )}
              >
                <Icon className="h-[17px] w-[17px] flex-none" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
