import { NAV_ITEMS } from "@/lib/constants";

/**
 * Pages an Owner may hand out to a member beyond their role's own default
 * (see NAV_ITEMS in constants.ts, the same registry the nav itself renders
 * from — this deliberately reuses it rather than a second, hand-maintained
 * list, so a page can never be grantable here without already being a real
 * page). /admin is excluded on purpose: it bundles unit/user/business-
 * settings management, several levels more sensitive than a single page
 * view, and handing it out piecemeal isn't something this pass's
 * page-level-only granularity can safely represent — Owner/Admin access
 * stays role-based only, unchanged. /social and /earnings are excluded too,
 * not for sensitivity but because every role already sees them (NAV_ITEMS'
 * own roles list), so there's nothing to additionally grant.
 */
export const GRANTABLE_PAGES = NAV_ITEMS.filter((i) => i.href !== "/admin" && i.href !== "/social" && i.href !== "/earnings").map((i) => i.href);

export function isGrantablePage(page: string): boolean {
  return (GRANTABLE_PAGES as string[]).includes(page);
}

/**
 * The one place "what pages can this member see" gets computed — nav
 * rendering, middleware's route guard, and the Access Management API all
 * call this instead of each re-deriving their own version, so they can
 * never quietly disagree (the exact failure mode "UI hides it, API/route
 * doesn't enforce it" already found and fixed once this session for
 * booking financial fields).
 *
 * role defaults ∪ additionalPages — additive only. There's no explicit-deny
 * concept anywhere in this app's existing RBAC (every canX/isX check in
 * rbac.ts is a straight role membership test), so this doesn't invent one;
 * an Owner revokes a grant by removing it, not by adding a "deny".
 * OWNER_ADMIN already implicitly sees every nav item (visibleNavItems in
 * constants.ts), so it's returned as full access here too, independent of
 * any stored grants.
 *
 * enabledModules is a separate, restrictive ceiling (Owner.enabledModules —
 * a per-tenant feature tier, not a per-member grant) applied last, after
 * role defaults and additive grants: null/undefined means unrestricted
 * (every owner that existed before this field was added keeps full
 * access), otherwise the result is intersected down to that list. This is
 * why OWNER_ADMIN can still end up without every page — the tier caps even
 * that tenant's own admin account, deliberately, for a newly-created owner
 * on a limited default tier.
 */
export function effectivePageAccess(role: string | undefined, additionalPages: string[], enabledModules?: string[] | null): string[] {
  const result =
    role === "OWNER_ADMIN"
      ? NAV_ITEMS.map((i) => i.href)
      : Array.from(new Set([...NAV_ITEMS.filter((i) => role && i.roles.includes(role)).map((i) => i.href), ...additionalPages.filter(isGrantablePage)]));
  if (!enabledModules) return result;
  return result.filter((href) => enabledModules.includes(href));
}
