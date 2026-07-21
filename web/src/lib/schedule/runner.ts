import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isScheduleDue } from "@/lib/schedule/due";
import { enqueue } from "@/lib/jobs/engine";

/**
 * Automation runner (M5 / ISS-A3, durable in M11-2). Invoked by the cron route
 * on a fixed tick. For every tenant whose schedule is DUE and under its daily
 * upload limit, it ENQUEUES one durable `schedule.generate` job (M11-1 engine)
 * — it no longer executes generation inline. The process-jobs worker claims and
 * runs the job (DRY, $0). Runs under the service role, tenant-scoped by
 * explicit tenant_id.
 *
 * Idempotency is exactly-once per (tenant, local day, run-slot): the
 * deterministic key + the jobs unique index make repeated OR concurrent cron
 * ticks converge on a single job. The daily-limit gate (runs since tenant-local
 * midnight vs upload_limit_per_day) is preserved unchanged.
 */

interface ScheduleRow {
  tenant_id: string;
  timezone: string | null;
  days: number[] | null;
  publish_times: string[] | null;
  pause_dates: string[] | null;
  holiday_mode: boolean | null;
  emergency_stop: boolean | null;
  upload_limit_per_day: number | null;
}

export interface RunSummary {
  scanned: number;
  due: number;
  /** Newly enqueued durable jobs. */
  triggered: number;
  skipped: number;
  errors: number;
  details: Array<{ tenantId: string; result: "triggered" | "skipped" | "error"; reason?: string }>;
}

/**
 * Deterministic idempotency key for a scheduled generation. Keyed by tenant +
 * tenant-local date + the run-slot (count of runs already created today), so:
 *  - repeated/concurrent ticks for the same slot dedupe to one job, and
 *  - the daily limit still governs how many distinct slots (jobs) a day gets.
 */
export function scheduleJobKey(tenantId: string, localDate: string, slot: number): string {
  return `schedule:gen:${tenantId}:${localDate}:${slot}`;
}

/** Runs already created for a tenant since its local midnight (limit gate). */
async function runsToday(admin: SupabaseClient, tenantId: string, midnightUtcIso: string): Promise<number> {
  const { count } = await admin
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("started_at", midnightUtcIso);
  return count ?? 0;
}

export async function runDueSchedules(now: Date = new Date()): Promise<RunSummary> {
  const admin = createAdminClient();
  const summary: RunSummary = { scanned: 0, due: 0, triggered: 0, skipped: 0, errors: 0, details: [] };

  const { data: schedules, error } = await admin
    .from("schedules")
    .select(
      "tenant_id, timezone, days, publish_times, pause_dates, holiday_mode, emergency_stop, upload_limit_per_day"
    );
  if (error || !schedules) return summary;

  for (const s of schedules as ScheduleRow[]) {
    summary.scanned++;
    if (!s.tenant_id) continue;

    // Due evaluation is unchanged: timezone, days, publish_times, pause_dates,
    // holiday_mode, emergency_stop all still gate here.
    const { due, local } = isScheduleDue(s, now);
    if (!due) {
      summary.skipped++;
      summary.details.push({ tenantId: s.tenant_id, result: "skipped", reason: "not due" });
      continue;
    }
    summary.due++;

    const limit = s.upload_limit_per_day ?? 1;
    const already = await runsToday(admin, s.tenant_id, local.midnightUtcIso);
    if (already >= limit) {
      summary.skipped++;
      summary.details.push({ tenantId: s.tenant_id, result: "skipped", reason: `daily limit ${limit} reached` });
      continue;
    }

    const idempotencyKey = scheduleJobKey(s.tenant_id, local.date, already);

    // Skip if this slot's job already exists in ANY state (queued/running/
    // succeeded/failed/dead) — exactly-once per slot, no duplicate work.
    const { data: existing } = await admin
      .from("jobs")
      .select("id, status")
      .eq("tenant_id", s.tenant_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      summary.skipped++;
      summary.details.push({
        tenantId: s.tenant_id,
        result: "skipped",
        reason: `already enqueued (${existing.status})`,
      });
      continue;
    }

    try {
      // enqueue is itself race-safe on the unique index — a concurrent tick
      // that wins the insert leaves this one returning the same job, never a
      // duplicate.
      await enqueue(
        {
          tenantId: s.tenant_id,
          type: "schedule.generate",
          idempotencyKey,
          payload: { scheduledDate: local.date, slot: already },
        },
        admin
      );
      summary.triggered++;
      summary.details.push({ tenantId: s.tenant_id, result: "triggered", reason: "enqueued" });
    } catch (err) {
      // Never swallow an enqueue failure — surface it in the summary AND record
      // a durable system event (no actor; the scheduler runs headless).
      summary.errors++;
      const reason = err instanceof Error ? err.message : "enqueue failed";
      summary.details.push({ tenantId: s.tenant_id, result: "error", reason });
      await admin
        .from("event_log")
        .insert({
          tenant_id: s.tenant_id,
          level: "error",
          source: "scheduler",
          message: `Failed to enqueue schedule.generate: ${reason}`,
        })
        .then(
          () => {},
          () => {}
        );
    }
  }
  return summary;
}
