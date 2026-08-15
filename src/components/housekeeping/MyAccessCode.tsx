"use client";

import { useEffect, useState } from "react";

// Spec section 9 — a housekeeper's own temporary code for a unit, if an
// Owner/Booker has generated one ahead of their clean. Fetches through
// GET /api/access/credential/my-housekeeping-code, the one reveal path
// open to HOUSEKEEPING itself (see that route + rbac.ts's
// canRevealAccessCredential, which excludes this role from the general
// guest-code reveal). Renders nothing when there's no active code — most
// cleans still happen with no pre-generated code at all (self-service,
// unchanged from before this feature).
export function MyAccessCode({ unitId }: { unitId: string }) {
  const [state, setState] = useState<{ loading: boolean; code: string | null; validUntil: string | null; credentialId: string | null; copied: boolean }>({
    loading: true, code: null, validUntil: null, credentialId: null, copied: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/access/credential/my-housekeeping-code?unitId=${unitId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setState((s) => ({ ...s, loading: false, code: data.code, validUntil: data.validUntil })); })
      .catch(() => { if (!cancelled) setState((s) => ({ ...s, loading: false })); });
    return () => { cancelled = true; };
  }, [unitId]);

  if (state.loading || !state.code) return null;

  const remainingMs = state.validUntil ? new Date(state.validUntil).getTime() - Date.now() : null;
  const remainingLabel = remainingMs && remainingMs > 0
    ? `${Math.floor(remainingMs / 3600000)}h ${Math.floor((remainingMs % 3600000) / 60000)}m`
    : null;

  async function copy() {
    if (!state.code) return;
    await navigator.clipboard.writeText(state.code).catch(() => {});
    setState((s) => ({ ...s, copied: true }));
  }

  return (
    <div className="rounded-xl border border-[var(--uc-gold,#D4AF37)]/40 bg-amber/5 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Temporary Access Code</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[24px] font-extrabold tracking-wider text-[var(--ink)]">{state.code}</span>
        <button onClick={copy} className="btn-sm btn-ghost">{state.copied ? "Copied" : "Copy"}</button>
      </div>
      {state.validUntil && (
        <div className="mt-1 flex justify-between text-[11px] font-semibold text-[var(--gray)]">
          <span>Valid until {new Date(state.validUntil).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          {remainingLabel && <span>{remainingLabel} left</span>}
        </div>
      )}
    </div>
  );
}
