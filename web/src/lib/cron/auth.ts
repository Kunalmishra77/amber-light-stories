import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Shared authentication for the Vercel Cron endpoints.
 *
 * Fails CLOSED: with `CRON_SECRET` unset the endpoint refuses rather than
 * running unauthenticated. The secret is accepted ONLY in the Authorization
 * header — the previous `?secret=` fallback put it in CDN access logs, browser
 * history and Referer headers, where anyone who recovered it could drive the
 * job engine, the scheduler and analytics ingestion for every tenant.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string };

export function authorizeCron(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: "CRON_SECRET not configured" };
  }

  const auth = request.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!provided || !constantTimeEquals(provided, secret)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

/** Length-independent constant-time comparison. */
function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare fixed-width digests of the inputs instead.
  if (ab.length !== bb.length) {
    const pad = Buffer.alloc(Math.max(ab.length, bb.length));
    const a2 = Buffer.concat([ab, pad]).subarray(0, pad.length);
    const b2 = Buffer.concat([bb, pad]).subarray(0, pad.length);
    timingSafeEqual(a2, b2);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
