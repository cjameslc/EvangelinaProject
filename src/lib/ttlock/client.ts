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
  const res = await fetch(`${DOMAIN}/oauth2/token`, {
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
  const res = await fetch(`${DOMAIN}/v3/key/list`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.errcode) throw new Error(`TTLock key/list failed: ${json.errmsg}`);
  return (json.list ?? []) as TtlockKey[];
}

/** Adds a temporary or permanent custom passcode to a WiFi/gateway-connected
 * lock (addType=2 — cloud-pushed, not a phone-bluetooth write). Not used by
 * the current battery-monitoring feature, but proven working this session
 * (add + delete round-trip against a live lock) — kept here as the base
 * primitive for the deferred per-booking e-key feature. */
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
  const res = await fetch(`${DOMAIN}/v3/keyboardPwd/add`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (!json.keyboardPwdId) throw new Error(`TTLock passcode add failed: ${json.errmsg || JSON.stringify(json)}`);
  return json;
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
  const res = await fetch(`${DOMAIN}/v3/keyboardPwd/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.errcode) throw new Error(`TTLock passcode delete failed: ${json.errmsg}`);
}
