import { NextResponse } from "next/server";
import { processJobs } from "@/lib/jobs/runner";
import { authorizeCron } from "@/lib/cron/auth";
import { sweepIncidentAlerts } from "@/lib/ops/alert-operator";

// Service-role + supabase-js — Node runtime, never prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jobs run sequentially and each may take up to its own `timeout_ms` (300s by
 * default), so without an explicit budget the platform default would cut the
 * batch mid-flight and leave the remaining jobs leased until the next reap.
 */
export const maxDuration = 300;

/**
 * Durable Job Engine drain endpoint (M11-1 / ISS-P5-02). Invoked by Vercel Cron
 * (see vercel.json). Stateless + idempotent-safe: claiming is atomic, so
 * repeated or overlapping invocations never double-process a job. Same
 * CRON_SECRET auth as the scheduler/analytics runners — never an open trigger.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const summary = await processJobs({ worker: "cron", batch: 25 });

  // Tell the operator about anything that broke — including incidents raised
  // by the Python render worker, which never passes through this app's code.
  // Runs after the drain so failures from THIS batch are included, and is
  // best-effort: sweepIncidentAlerts never throws, so a mail problem can't
  // fail the drain that just succeeded.
  const alerted = await sweepIncidentAlerts();

  return NextResponse.json({ ok: true, ...summary, alerted });
}
