// Split out from viewMode.ts specifically so client components (Navbar)
// can import just the cookie name without pulling in next/headers, which
// only works in Server Components/Route Handlers and would break the
// client bundle if imported here.
export const VIEW_MODE_COOKIE = "view-mode";
export type ViewMode = "staff" | "travel";
