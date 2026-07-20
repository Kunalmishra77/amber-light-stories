import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateRequest } from "@/lib/api/request";
import { API_VERSION } from "@/lib/api/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/stories — lists the authenticated tenant's stories. Demonstrates
 * scoped access (`stories:read`) + strict tenant isolation: the service-role
 * client is scoped IN CODE by `ctx.tenantId`, never by a session. Supports
 * `?limit=` (1–100, default 25).
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "stories:read");
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 25;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stories")
    .select("id, topic, logline, status, duration_seconds, created_at")
    .eq("tenant_id", auth.ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load stories.", api_version: API_VERSION },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { api_version: API_VERSION, data: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
