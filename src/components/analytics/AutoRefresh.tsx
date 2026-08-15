"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "@/components/ui/Icons";

// This app has no WebSocket/SSE infrastructure anywhere — "real-time" here
// means auto-refresh on an interval + a manual button, matching Dashboard's
// existing unstable_cache(revalidate: 45) pattern. 60s here (not 45) since
// Analytics aggregates far more data per load than any single Dashboard
// query. router.refresh() re-runs the Server Components, which re-hit the
// (60s-revalidate) cached section queries, so a manual refresh within the
// cache window is instant and one just outside it gets fresh data.
export function AutoRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Skip while backgrounded — router.refresh() re-runs Analytics' full
    // Server Component tree (the heaviest per-request computation in this
    // app, see queries.ts), so a tab left open in the background all day
    // was paying that cost every 60s for nobody to see. Same reasoning and
    // pattern as src/lib/deployment-client.ts's poll, which real production
    // traffic sampling showed was the single largest source of request
    // volume app-wide.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  function manualRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <button onClick={manualRefresh} className="btn-icon" aria-label="Refresh" title="Refresh">
      <RefreshIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
    </button>
  );
}
