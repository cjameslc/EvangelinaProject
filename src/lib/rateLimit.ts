/**
 * Best-effort, in-memory rate limiter — no Redis/KV is provisioned for this
 * app, so this only protects a single serverless instance and resets on
 * cold start. That's still worth having: it stops a single client from
 * hammering the Gemini API or the email-token endpoint in a tight loop,
 * which is the realistic threat here (this app has no adversarial traffic
 * today). Not a substitute for real distributed rate limiting if this ever
 * needs to withstand a genuine abuse campaign.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
