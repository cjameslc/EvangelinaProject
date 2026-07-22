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
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
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
