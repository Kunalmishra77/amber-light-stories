import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort absolute origin for the current request — used to build
 * absolute URLs for Supabase auth email redirects (password reset) and the
 * credential email's login link. No NEXT_PUBLIC_APP_URL is configured for
 * this project, so this reads the request's own Host header, which works
 * unchanged for localhost dev and every Vercel deployment/preview domain.
 */
export async function getAppOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
