import { getActiveDeploymentEvent } from "@/lib/deployment";

// No cookies()/headers()/searchParams usage here for Next to infer
// dynamic rendering from — without this, the page gets frozen as static
// HTML at BUILD time (whatever the active event was during that build,
// forever, until the next deploy), which defeats the entire point of a
// live maintenance notice.
export const dynamic = "force-dynamic";

// Reached only via src/middleware.ts's maintenance-mode redirect (non-admin
// roles, while a DeploymentEvent has fullMaintenanceMode on) — not linked
// from anywhere, and not gated by ROUTE_ROLES itself since anyone redirected
// here already failed that check by construction.
export default async function MaintenancePage() {
  const event = await getActiveDeploymentEvent();

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-amber/10 text-2xl">🛠️</div>
      <h1 className="text-lg font-extrabold text-[var(--ink)]">{event?.title ?? "We'll be right back"}</h1>
      <p className="text-[13.5px] text-[var(--gray)]">
        {event?.description ?? "This part of the app is temporarily unavailable while we deploy an update. Thanks for your patience."}
      </p>
      <a href="/maintenance" className="btn-primary mt-2">Check again</a>
    </div>
  );
}
