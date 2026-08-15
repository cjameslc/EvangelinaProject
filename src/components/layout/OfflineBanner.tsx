"use client";

import { useEffect, useState } from "react";
import { listQueuedMutations } from "@/lib/offlineQueue";

/**
 * This app already has real offline infrastructure — public/sw.js caches
 * static assets and a handful of read-heavy API routes (Housekeeping,
 * Bookings, Calendar) cache-first/network-first-with-fallback, and
 * src/lib/offlineQueue.ts queues staff mutations in IndexedDB and replays
 * them the moment connectivity returns. None of it was ever visible,
 * though — going offline just silently degraded, with no indication of
 * why a save seemed to do nothing, or that the data on screen might be
 * stale. This is the missing visible half: a persistent banner the moment
 * navigator.onLine goes false, naming what's actually true (you're
 * offline, but cached data/already-loaded pages keep working), plus a
 * count of anything queued so it doesn't read as silently failing.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);

    function updateQueuedCount() {
      listQueuedMutations().then((items) => setQueuedCount(items.length)).catch(() => {});
    }
    updateQueuedCount();

    function goOffline() {
      setOnline(false);
      setJustReconnected(false);
    }
    function goOnline() {
      setOnline(true);
      updateQueuedCount();
      setJustReconnected(true);
      // Queued mutations flush asynchronously (see attachOfflineQueueListeners);
      // re-check the count shortly after so the banner's number doesn't sit
      // stale once they've actually gone through.
      const t = setTimeout(updateQueuedCount, 2500);
      const hide = setTimeout(() => setJustReconnected(false), 4000);
      return () => { clearTimeout(t); clearTimeout(hide); };
    }
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    const interval = setInterval(updateQueuedCount, 15000);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearInterval(interval);
    };
  }, []);

  if (online && !justReconnected) return null;

  return (
    <div
      className={
        online
          ? "flex items-center justify-center gap-2 border-b border-teal/25 bg-teal/10 px-4 py-2 text-center text-[12.5px] font-bold text-teal"
          : "flex items-center justify-center gap-2 border-b border-amber/25 bg-amber/10 px-4 py-2 text-center text-[12.5px] font-bold text-amber"
      }
    >
      <span className={online ? "h-2 w-2 flex-none rounded-full bg-teal" : "h-2 w-2 flex-none animate-pulse rounded-full bg-amber"} aria-hidden="true" />
      {online ? (
        <span>Back online{queuedCount > 0 ? ` — syncing ${queuedCount} change${queuedCount !== 1 ? "s" : ""}…` : ""}</span>
      ) : (
        <span>
          You&rsquo;re offline — pages and data you&rsquo;ve already loaded still work from cache.
          {queuedCount > 0 && ` ${queuedCount} change${queuedCount !== 1 ? "s" : ""} will sync once you're back online.`}
        </span>
      )}
    </div>
  );
}
