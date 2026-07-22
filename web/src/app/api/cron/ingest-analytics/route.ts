import { NextResponse } from "next/server";
import { runAnalyticsIngestion } from "@/lib/analytics/runner";
import { authorizeCron } from "@/lib/cron/auth";

// Service-role + supabase-js — Node runtime, never prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Analytics ingestion endpoint (M10 / ISS-P3-05). Invoked by Vercel Cron (see
 * vercel.json). Ingests per-video metrics for every active tenant in DRY mode
 * ($0). Same CRON_SECRET auth as the scheduler runner — never an open trigger.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const summary = await runAnalyticsIngestion("dry");
  return NextResponse.json({ ok: true, ...summary });
}
