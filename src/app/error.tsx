"use client";

import { useEffect } from "react";

// Catches any uncaught error thrown while rendering a route (a transient
// Neon connection drop, an unexpected null, etc.) so the user sees a
// branded, recoverable screen instead of Next's raw "Application error: a
// server-side exception has occurred" page. Doesn't catch errors thrown by
// the root layout itself — see global-error.tsx for that.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-14 text-center">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-8 shadow-s">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rausch/10 text-2xl">⚠️</div>
        <h1 className="text-[19px] font-extrabold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-[13.5px] text-[var(--gray)]">
          This is usually temporary — often a brief hiccup reaching the database. Try again in a moment.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button onClick={() => reset()} className="btn-primary">Try again</button>
          <a href="/" className="btn-ghost">Go home</a>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-[var(--gray)]">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
