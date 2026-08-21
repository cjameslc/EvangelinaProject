import crypto from "crypto";

// TTLock Open Platform client. This account holds *common* ekeys (not
// top-administrator) on every lock — confirmed by testing both endpoints
// directly: /v3/lock/list (admin-only) returns nothing for this account,
// while /v3/key/list (admin + shared ekeys) returns all of them, and a real
// passcode add/delete round-trip succeeded. So every call here goes through
// the key/list + passcode endpoints, never lock/list.
//
// No token persistence or refresh-token handling — a fresh access token is
// minted on every call via the password grant. Calls into this module are
// infrequent (a webhook hit, an admin mapping lookup, a daily cron run), so
// the extra round-trip is cheap and avoids an entire class of stale/expired
// token bugs a persisted-token cache would otherwise need to handle.
const DOMAIN = "https://api.ttlock.com";

// None of these calls had a timeout before — a hung TTLock API (as opposed
// to a fast error) would hang the whole attempt indefinitely, which starves
// src/lib/access/service.ts's withRetry() of the ability to actually retry (it can't
// move to attempt 2 if attempt 1 never settles) and, for the one call site
// that's awaited into a response (booking cancel/edit), risks the request
// hanging until the platform's own hard timeout. 8s comfortably covers a
// slow-but-working real TTLock response (observed real calls this session
// were all sub-2s) while still leaving room for withRetry's 3 attempts to
// finish within a typical serverless function's execution budget.
const REQUEST_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`TTLock request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type TtlockKey = {
  keyId: number;
  lockId: number;
  lockAlias: string;
  lockName: string;
  lockMac: string;
  electricQuantity: number;
  hasGateway: number; // 1 or 0
  userType: string; // "110301" admin ekey, "110302" common ekey
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getAccessToken(): Promise<string> {
  const clientId = requireEnv("TTLOCK_CLIENT_ID");
  const clientSecret = requireEnv("TTLOCK_CLIENT_SECRET");
  const username = requireEnv("TTLOCK_USERNAME");
  const password = requireEnv("TTLOCK_PASSWORD");
  const md5Password = crypto.createHash("md5").update(password).digest("hex");

  const body = new URLSearchParams({
    clientId,
    clientSecret,
    username,
    password: md5Password,
    grant_type: "password",
  });
  const res = await fetchWithTimeout(`${DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`TTLock auth failed: ${json.errmsg || json.error_description || JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

/** All locks (and lift/power-saver devices, filtered out here) shared to or
 * administered by this account — see the module comment for why this uses
 * key/list rather than lock/list. */
export async function listTtlockLocks(): Promise<TtlockKey[]> {
  const accessToken = await getAccessToken();
  const clientId = requireEnv("TTLOCK_CLIENT_ID");
  const body = new URLSearchParams({
    clientId,
    accessToken,
    pageNo: "1",
    pageSize: "200",
    date: String(Date.now()),
  });
  const res = await fetchWithTimeout(`${DOMAIN}/v3/key/list`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.errcode) throw new Error(`TTLock key/list failed: ${json.errmsg}`);
  return (json.list ?? []) as TtlockKey[];
}

/** Adds a temporary or permanent custom passcode to a WiFi/gateway-connected
 * lock (addType=2 — cloud-pushed, not a phone-bluetooth write). The base
 * primitive src/lib/access/service.ts builds the real per-booking and
 * emergency-admin credential flows on top of. */
export async function addTtlockPasscode(params: {
  lockId: number;
  passcode: string;
  name: string;
  startDate: number;
  endDate: number;
}): Promise<{ keyboardPwdId: number }> {
  const accessToken = await getAccessToken();
  const clientId = requireEnv("TTLOCK_CLIENT_ID");
  const now = Date.now();
  const body = new URLSearchParams({
    clientId,
    accessToken,
    lockId: String(params.lockId),
    keyboardPwd: params.passcode,
    keyboardPwdName: params.name,
    keyboardPwdType: "3",
    startDate: String(params.startDate),
    endDate: String(params.endDate),
    addType: "2",
    date: String(now),
  });
  const res = await fetchWithTimeout(`${DOMAIN}/v3/keyboardPwd/add`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (!json.keyboardPwdId) throw new Error(`TTLock passcode add failed: ${json.errmsg || JSON.stringify(json)}`);
  return json;
}

/** Permanent, non-expiring passcode (keyboardPwdType=2) — used for the
 * one-time emergency-reserve-code provisioning and for a unit's fixed
 * AIRBNB_PERMANENT code (see setAirbnbPermanentCode in access/service.ts).
 * Never used for an ordinary per-booking guest code — those get a period
 * passcode via addTtlockPasscode, scoped to the actual stay dates. */
export async function addTtlockPermanentPasscode(params: {
  lockId: number;
  passcode: string;
  name: string;
}): Promise<{ keyboardPwdId: number }> {
  const accessToken = await getAccessToken();
  const clientId = requireEnv("TTLOCK_CLIENT_ID");
  const body = new URLSearchParams({
    clientId,
    accessToken,
    lockId: String(params.lockId),
    keyboardPwd: params.passcode,
    keyboardPwdName: params.name,
    keyboardPwdType: "2",
    addType: "2",
    date: String(Date.now()),
  });
  const res = await fetchWithTimeout(`${DOMAIN}/v3/keyboardPwd/add`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (!json.keyboardPwdId) throw new Error(`TTLock permanent passcode add failed: ${json.errmsg || JSON.stringify(json)}`);
  return json;
}

export type TtlockAccessRecord = {
  recordId: number;
  lockId: number;
  /** When the lock itself reports the event happened — the one this app's
   * classifier compares against credential validFrom/validUntil, since a
   * guest's actual entry time is what matters, not when TTLock's servers
   * heard about it. */
  lockDate: number;
  /** When TTLock's own servers received/logged the event — can lag
   * lockDate by seconds to minutes on a gateway-relayed lock; kept only
   * for diagnostics, never used for the authorization time-window check. */
  serverDate: number;
  /** 1 = the lock actually opened; 0 = a rejected attempt (wrong/expired
   * code) — TTLock still logs these, and they're real signal (see
   * eventClassifier.ts). */
  success: number;
  /** The passcode/credential identifier as TTLock reports it. For a
   * successful passcode unlock this is the real plaintext code — masked
   * to its last 2 characters before this app ever stores or displays it
   * (see AccessEvent's own doc comment). */
  keyboardPwd: string;
  /** TTLock's own label for whoever/whatever unlocked it — e.g. the
   * passcode's registered name, or "Admin" for the account holder's own
   * key. Confirmed live on this account: the owner's routine physical
   * access shows up as username "Admin" with a static code, used many
   * times a week with no booking behind any of them — a real signal this
   * app's classifier treats as trusted-by-name (Settings.
   * trustedTtlockUsernames), not as "no association found." */
  username: string;
};

/** Real unlock/access history for one lock — this app's only source of
 * "did someone actually open this door," since nothing else here tracks
 * physical access. No webhook exists for this account's TTLock tier (per
 * this module's own opening comment on what this account can and can't
 * do), so src/lib/access/eventSync.ts polls this on the shared daily cron
 * plus an on-demand manual trigger — see that module's doc comment for
 * why "real-time" here means "at most one poll cycle behind," not a live
 * push. */
export async function listTtlockAccessRecords(params: {
  lockId: number;
  startDate: number;
  endDate: number;
  pageNo?: number;
  pageSize?: number;
}): Promise<{ list: TtlockAccessRecord[]; total: number; pages: number }> {
  const accessToken = await getAccessToken();
  const clientId = requireEnv("TTLOCK_CLIENT_ID");
  const body = new URLSearchParams({
    clientId,
    accessToken,
    lockId: String(params.lockId),
    startDate: String(params.startDate),
    endDate: String(params.endDate),
    pageNo: String(params.pageNo ?? 1),
    pageSize: String(params.pageSize ?? 100),
    date: String(Date.now()),
  });
  const res = await fetchWithTimeout(`${DOMAIN}/v3/lockRecord/list`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.errcode) throw new Error(`TTLock lockRecord/list failed: ${json.errmsg}`);
  return { list: (json.list ?? []) as TtlockAccessRecord[], total: json.total ?? 0, pages: json.pages ?? 0 };
}

export async function deleteTtlockPasscode(lockId: number, keyboardPwdId: number): Promise<void> {
  const accessToken = await getAccessToken();
  const clientId = requireEnv("TTLOCK_CLIENT_ID");
  const body = new URLSearchParams({
    clientId,
    accessToken,
    lockId: String(lockId),
    keyboardPwdId: String(keyboardPwdId),
    deleteType: "2",
    date: String(Date.now()),
  });
  const res = await fetchWithTimeout(`${DOMAIN}/v3/keyboardPwd/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.errcode) throw new Error(`TTLock passcode delete failed: ${json.errmsg}`);
}
