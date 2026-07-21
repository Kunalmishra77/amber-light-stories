import { NextResponse } from "next/server";
import { processJobs } from "@/lib/jobs/runner";

// Service-role + supabase-js — Node runtime, never prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Durable Job Engine drain endpoint (M11-1 / ISS-P5-02). Invoked by Vercel Cron
 * (see vercel.json). Stateless + idempotent-safe: claiming is atomic, so
 * repeated or overlapping invocations never double-process a job. Same
 * CRON_SECRET auth as the scheduler/analytics runners — never an open trigger.
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

  const summary = await processJobs({ worker: "cron", batch: 25 });
  return NextResponse.json({ ok: true, ...summary });
}
