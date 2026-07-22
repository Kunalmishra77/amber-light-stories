import { NextResponse } from "next/server";
import { runDueSchedules } from "@/lib/schedule/runner";
import { authorizeCron } from "@/lib/cron/auth";

// Service-role + supabase-js — run on the Node runtime, never prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Automation runner endpoint (M5 / ISS-A3). Invoked by Vercel Cron (see
 * vercel.json). Executes every due tenant schedule in DRY mode ($0).
 *
 * Auth: requires the `CRON_SECRET` env var. Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`. The secret is never accepted in the
 * URL (query strings land in access logs). If `CRON_SECRET` is unset the
 * endpoint refuses, so it can never be an open trigger.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const summary = await runDueSchedules();
  return NextResponse.json({ ok: true, ...summary });
}
