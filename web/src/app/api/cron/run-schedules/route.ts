import { NextResponse } from "next/server";
import { runDueSchedules } from "@/lib/schedule/runner";

// Service-role + supabase-js — run on the Node runtime, never prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Automation runner endpoint (M5 / ISS-A3). Invoked by Vercel Cron (see
 * vercel.json). Executes every due tenant schedule in DRY mode ($0).
 *
 * Auth: requires the `CRON_SECRET` env var. Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`; a `?secret=` query param is accepted
 * for manual/owner runs. If `CRON_SECRET` is unset the endpoint refuses, so
 * it can never be an open trigger.
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

  const summary = await runDueSchedules();
  return NextResponse.json({ ok: true, ...summary });
}
