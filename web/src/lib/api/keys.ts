import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * Scoped API-key primitives (M8 / P2-12). A full token looks like:
 *   ak_live_<8 hex prefix>_<48 hex secret>
 * Only the sha256 hash of the full token is stored; the raw token is shown to
 * the tenant exactly ONCE at issue/rotate time. The `prefix` (ak_live_<8hex>)
 * is stored in the clear for display + O(1) lookup on authentication.
 */
export const KEY_PREFIX = "ak_live_";

export interface GeneratedKey {
  /** Public identifier, stored + shown (e.g. ak_live_ab12cd34). */
  prefix: string;
  /** The full secret token — returned to the caller ONCE, never persisted. */
  token: string;
  /** sha256 hex of `token` — this is what we persist. */
  hash: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiKey(): GeneratedKey {
  const prefixPart = randomBytes(4).toString("hex"); // 8 hex chars
  const secretPart = randomBytes(24).toString("hex"); // 48 hex chars
  const prefix = `${KEY_PREFIX}${prefixPart}`;
  const token = `${prefix}_${secretPart}`;
  return { prefix, token, hash: hashToken(token) };
}

/**
 * Extract the stored `prefix` (ak_live_<8hex>) from a presented token, so we
 * can look the row up before hashing + comparing. Returns null for anything
 * that doesn't match the expected shape.
 */
export function parsePrefix(token: string): string | null {
  if (!token.startsWith(KEY_PREFIX)) return null;
  const rest = token.slice(KEY_PREFIX.length);
  const prefixPart = rest.split("_")[0];
  if (!prefixPart || !/^[0-9a-f]{8}$/.test(prefixPart)) return null;
  return `${KEY_PREFIX}${prefixPart}`;
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Whether a key's granted scopes satisfy a required scope. `*` = all. */
export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes("*") || scopes.includes(required);
}

/** A webhook signing secret (whsec_<hex>) — retrievable to sign payloads. */
export function generateSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}
