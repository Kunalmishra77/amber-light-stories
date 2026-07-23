import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuthNotConfiguredError } from "@/lib/publishing/errors";

/**
 * YouTube OAuth configuration and CSRF state — deliberately free of
 * `googleapis`.
 *
 * The publish worker calls `isOAuthConfigured()` on every job just to decide
 * dry vs live. When that lived alongside the API client, answering "are two env
 * vars set?" pulled in the whole googleapis surface — tens of megabytes on a
 * cold start, and slow enough to blow a job timeout. Only the code that
 * actually talks to Google should pay for the client.
 *
 * These helpers use node:crypto only, which also makes the state signing
 * directly unit-testable.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export const YOUTUBE_OAUTH_COOKIE = "yt_oauth_nonce";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Platform OAuth client credentials. Deliberately separate env vars from the
 * Gmail sender client (`GOOGLE_CLIENT_ID`) so the two consents can be granted,
 * rotated and revoked independently — but falls back to the shared client if a
 * deployment only configures one.
 */
export function getOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isOAuthConfigured(): boolean {
  return getOAuthConfig() !== null;
}

/** The redirect URI must match a URI registered on the Google OAuth client. */
export async function getRedirectUri(): Promise<string> {
  // Imported lazily: `next/headers` exists only inside a request, and this
  // module is also loaded by the durable job worker.
  const { getAppOrigin } = await import("@/lib/site-url");
  return `${await getAppOrigin()}/api/oauth/youtube/callback`;
}

function stateSecret(): string {
  // Any server-held secret works as the signing key; the service-role key is
  // already required for this process to function and never leaves the server.
  const secret =
    process.env.OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CRON_SECRET;
  if (!secret) throw new OAuthNotConfiguredError();
  return secret;
}

export interface OAuthState {
  tenantId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function encodeState(input: Omit<OAuthState, "nonce" | "issuedAt">): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(24).toString("base64url");
  const body: OAuthState = { ...input, nonce, issuedAt: Date.now() };
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return { state: `${payload}.${sign(payload)}`, nonce };
}

/**
 * Verifies signature, expiry, and the double-submit nonce. Returns null for any
 * failure — callers must not distinguish the reasons to the browser.
 */
export function decodeState(state: string | null, cookieNonce: string | null): OAuthState | null {
  if (!state || !cookieNonce) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: OAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return null;
  }
  if (!parsed.tenantId || !parsed.nonce) return null;
  if (Date.now() - parsed.issuedAt > STATE_TTL_MS) return null;

  const n1 = Buffer.from(parsed.nonce);
  const n2 = Buffer.from(cookieNonce);
  if (n1.length !== n2.length || !timingSafeEqual(n1, n2)) return null;

  return parsed;
}
