import { createHmac, timingSafeEqual } from "crypto";

/**
 * API security controls (M13 S1 / P7-06 remainder). Pure functions layered on
 * top of the M8 key authentication path — key expiry, IP allowlists, and
 * inbound request signature verification with replay protection.
 */

/** A key is usable only while it is neither revoked nor past its expiry. */
export function isKeyExpired(
  key: { revoked_at?: string | null; expires_at?: string | null; created_at?: string | null },
  nowMs: number,
  maxKeyAgeDays?: number | null
): { expired: boolean; reason?: string } {
  if (key.revoked_at) return { expired: true, reason: "key revoked" };
  if (key.expires_at && Date.parse(key.expires_at) <= nowMs) {
    return { expired: true, reason: "key past its expiry date" };
  }
  if (maxKeyAgeDays && key.created_at) {
    const ageDays = (nowMs - Date.parse(key.created_at)) / 86_400_000;
    if (ageDays > maxKeyAgeDays) {
      return { expired: true, reason: `key exceeds the ${maxKeyAgeDays}-day maximum age policy` };
    }
  }
  return { expired: false };
}

/* ---------------- IP allowlist (IPv4 + CIDR, no external service) ------- */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) + n;
  }
  return out >>> 0;
}

/** Does `ip` fall inside `entry` (exact IP or CIDR)? */
export function ipMatches(ip: string, entry: string): boolean {
  const clean = entry.trim();
  if (!clean) return false;
  if (!clean.includes("/")) return clean === ip.trim();
  const [network, bitsRaw] = clean.split("/");
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(network);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** Empty allowlist = unrestricted (opt-in control). */
export function isIpAllowed(ip: string | null, allowlist: string[] | null | undefined): boolean {
  const list = (allowlist ?? []).filter(Boolean);
  if (list.length === 0) return true;
  if (!ip) return false; // a restricted key must present a resolvable address
  return list.some((entry) => ipMatches(ip, entry));
}

/* ---------------- Inbound request signing (replay-protected) ------------ */

/** Canonical signing string: `<timestamp>.<method>.<path>.<body>`. */
export function canonicalRequest(timestampSec: number, method: string, path: string, body: string): string {
  return `${timestampSec}.${method.toUpperCase()}.${path}.${body}`;
}

export function signRequest(secret: string, timestampSec: number, method: string, path: string, body: string): string {
  return createHmac("sha256", secret)
    .update(canonicalRequest(timestampSec, method, path, body))
    .digest("hex");
}

/** Parse a `t=<unix>,v1=<hex>` header. */
export function parseSignatureHeader(header: string | null): { t: number; v1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  ) as Record<string, string>;
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return null;
  return { t, v1: parts.v1 };
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Verify an inbound signature. Rejects a stale/future timestamp first (replay
 * protection), then compares in constant time.
 */
export function verifyRequestSignature(input: {
  header: string | null;
  secret: string | null;
  method: string;
  path: string;
  body: string;
  nowMs: number;
  maxSkewSeconds?: number;
}): { valid: boolean; reason?: string } {
  if (!input.secret) return { valid: false, reason: "no signing secret configured for this key" };
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return { valid: false, reason: "missing or malformed signature header" };

  const skew = Math.abs(input.nowMs / 1000 - parsed.t);
  const maxSkew = input.maxSkewSeconds ?? 300;
  if (skew > maxSkew) {
    return { valid: false, reason: `signature timestamp outside the ${maxSkew}s window (replay protection)` };
  }

  const expected = signRequest(input.secret, parsed.t, input.method, input.path, input.body);
  return safeEqualHex(expected, parsed.v1)
    ? { valid: true }
    : { valid: false, reason: "signature mismatch" };
}
