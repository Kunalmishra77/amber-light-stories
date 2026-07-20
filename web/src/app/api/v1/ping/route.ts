import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/request";
import { API_VERSION } from "@/lib/api/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/ping — the minimal authenticated endpoint. Proves the API-key
 * auth + scope + rate-limit path end-to-end and echoes the resolved tenant.
 * Requires the `read` scope.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "read");
  if ("response" in auth) return auth.response;

  return NextResponse.json(
    {
      ok: true,
      api_version: API_VERSION,
      tenant_id: auth.ctx.tenantId,
      scopes: auth.ctx.scopes,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
