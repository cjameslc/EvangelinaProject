"use client";

// A cross-platform-safe offline mutation queue, living in app code rather
// than the service worker. The usual approach — the Background Sync API —
// does not exist in iOS Safari, and this app needs to work on iPhone, so
// queued mutations are persisted here (IndexedDB) and flushed on an
// `online` event / tab-visible check instead of relying on SW background
// sync.

const DB_NAME = "evangelina-offline-queue";
const STORE = "mutations";

type QueuedMutation = {
  id?: number;
  url: string;
  method: string;
  bodyJson?: any;
  // FormData can't be stored as-is in IndexedDB in a portable way, but the
  // File/Blob values inside it can — stored as a plain part-map and
  // reassembled into a real FormData on replay.
  formDataParts?: Record<string, string | File>;
  createdAt: number;
  label: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueMutation(m: Omit<QueuedMutation, "id" | "createdAt">) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...m, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedMutation(id: number) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replay(item: QueuedMutation): Promise<Response> {
  if (item.formDataParts) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(item.formDataParts)) fd.append(k, v as any);
    return fetch(item.url, { method: item.method, body: fd });
  }
  return fetch(item.url, { method: item.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.bodyJson) });
}

let flushing = false;
export async function flushQueuedMutations() {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    const items = (await listQueuedMutations()).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      try {
        const res = await replay(item);
        if (res.ok && item.id !== undefined) await removeQueuedMutation(item.id);
      } catch {
        break; // still offline (or a real network failure) — stop, retry on the next flush
      }
    }
  } finally {
    flushing = false;
  }
}

let listenersAttached = false;
export function attachOfflineQueueListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  window.addEventListener("online", () => flushQueuedMutations());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushQueuedMutations();
  });
  flushQueuedMutations();
}

/**
 * Runs a real fetch; if the network is down (or the request throws),
 * queues it for later instead of failing outright. `queued: true` means the
 * caller should reflect an optimistic/pending state rather than an error.
 */
export async function fetchOrQueue(mutation: Omit<QueuedMutation, "id" | "createdAt">): Promise<{ queued: boolean; response?: Response }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueueMutation(mutation);
    return { queued: true };
  }
  try {
    const res = await replay({ ...mutation, createdAt: Date.now() });
    return { queued: false, response: res };
  } catch {
    await enqueueMutation(mutation);
    return { queued: true };
  }
}
