import { NextResponse } from "next/server";
import { runAnalyticsIngestion } from "@/lib/analytics/runner";

// Service-role + supabase-js — Node runtime, never prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Analytics ingestion endpoint (M10 / ISS-P3-05). Invoked by Vercel Cron (see
 * vercel.json). Ingests per-video metrics for every active tenant in DRY mode
 * ($0). Same CRON_SECRET auth as the scheduler runner — never an open trigger.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  const provided = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : new URL(request.url).searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const summary = await runAnalyticsIngestion("dry");
  return NextResponse.json({ ok: true, ...summary });
}
