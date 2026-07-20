import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, parsePrefix, safeEqualHex, hasScope } from "@/lib/api/keys";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { API_VERSION } from "@/lib/api/version";

/**
 * The single authentication seam every `/api/v1` route calls (M8 / P2-12).
 * It authenticates the bearer API key, enforces the required scope, applies
 * the per-key rate-limit hook, logs the request (rate-limit + observability),
 * and returns either a resolved {tenantId, keyId, scopes} context or a ready-
 * to-return error Response. Tenant isolation is enforced IN CODE via the
 * resolved `tenantId` — the public API uses the service-role client (no
 * auth.uid()), so callers MUST scope every query by `ctx.tenantId`.
 */
export interface ApiContext {
  tenantId: string;
  keyId: string;
  scopes: string[];
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  // Also accept the raw token in `X-API-Key` for convenience.
  const alt = request.headers.get("x-api-key");
  return alt ? alt.trim() : null;
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { error: message, api_version: API_VERSION },
    { status, headers: { "Cache-Control": "no-store", ...extraHeaders } }
  );
}

export async function authenticateRequest(
  request: Request,
  requiredScope: string
): Promise<{ ctx: ApiContext } | { response: NextResponse }> {
  const token = bearerToken(request);
  if (!token) {
    return { response: jsonError(401, "Missing API key. Send 'Authorization: Bearer <key>'.") };
  }

  const prefix = parsePrefix(token);
  if (!prefix) return { response: jsonError(401, "Malformed API key.") };

  const admin = createAdminClient();
  const { data: key } = await admin
    .from("api_keys")
    .select("id, tenant_id, key_hash, scopes, rate_limit_per_min, revoked_at")
    .eq("prefix", prefix)
    .maybeSingle();

  if (!key || key.revoked_at || !safeEqualHex(hashToken(token), key.key_hash as string)) {
    return { response: jsonError(401, "Invalid or revoked API key.") };
  }

  const scopes = (key.scopes ?? []) as string[];
  if (!hasScope(scopes, requiredScope)) {
    return { response: jsonError(403, `This key is missing the required scope: ${requiredScope}.`) };
  }

  const rate = await enforceRateLimit(admin, key.id as string, (key.rate_limit_per_min as number) ?? 60);

  // Log the request (backs the rate-limit window + API observability). The
  // status is optimistic (200) — a hard failure downstream still returns
  // non-200 to the caller; the log's purpose here is throttling, not billing.
  const method = request.method;
  const path = new URL(request.url).pathname;
  await admin.from("api_request_log").insert({
    tenant_id: key.tenant_id,
    api_key_id: key.id,
    method,
    path,
    status: rate.allowed ? 200 : 429,
  });

  if (!rate.allowed) {
    return {
      response: jsonError(429, "Rate limit exceeded.", {
        "Retry-After": String(rate.retryAfter ?? 60),
        "X-RateLimit-Limit": String(rate.limit),
        "X-RateLimit-Remaining": "0",
      }),
    };
  }

  // Best-effort last-used stamp (never blocks the request).
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  return { ctx: { tenantId: key.tenant_id as string, keyId: key.id as string, scopes } };
}
