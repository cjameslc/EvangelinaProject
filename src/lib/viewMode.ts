import { cookies } from "next/headers";
import { VIEW_MODE_COOKIE, type ViewMode } from "@/lib/viewModeCookie";

// A lightweight, session-independent preference — NOT an auth mechanism.
// An employee's actual access (middleware, RBAC, every protected route) is
// completely unaffected by this cookie; it only controls which nav/
// homepage renders for them. Switching to "travel" and browsing straight
// to /dashboard still works — this is a view, not a permission.
export { VIEW_MODE_COOKIE };
export type { ViewMode };

export function getViewMode(): ViewMode {
  return cookies().get(VIEW_MODE_COOKIE)?.value === "travel" ? "travel" : "staff";
}
