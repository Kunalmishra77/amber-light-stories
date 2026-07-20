import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStoryGeneration } from "@/lib/pipeline/generation";
import type { MockStorySettings } from "@/lib/generate/mock-story";
import { isScheduleDue } from "@/lib/schedule/due";

/**
 * Automation runner (M5 / ISS-A3) — executes each tenant's schedule cadence.
 * Invoked by the cron route on a fixed tick; for every tenant whose schedule
 * is DUE and under its daily upload limit, it runs one generation in DRY mode
 * ($0 — reuses the M4 engine + M3 provider/credential seam). Runs under the
 * service role (no user session), tenant-scoped by explicit tenant_id.
 *
 * Idempotent per tenant-local day: it counts runs already created since the
 * tenant's local midnight and never exceeds `upload_limit_per_day`, so extra
 * cron ticks in the same day are no-ops.
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
  triggered: number;
  skipped: number;
  errors: number;
  details: Array<{ tenantId: string; result: "triggered" | "skipped" | "error"; reason?: string }>;
}

async function loadTenantSettings(
  admin: SupabaseClient,
  tenantId: string
): Promise<{ settings: MockStorySettings; projectId: string | null; budget: number | null }> {
  const [{ data: project }, { data: ts }] = await Promise.all([
    admin
      .from("projects")
      .select("id, per_video_budget_usd, target_seconds, niche, language")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle(),
    admin.from("tenant_settings").select("industry, keywords").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return {
    settings: {
      niche: project?.niche ?? null,
      language: project?.language ?? null,
      targetSeconds: project?.target_seconds ?? 45,
      industry: ts?.industry ?? null,
      keywords: (ts?.keywords as string[] | null) ?? null,
    },
    projectId: project?.id ?? null,
    budget: project?.per_video_budget_usd ?? null,
  };
}

/** Runs of the day already created for a tenant since its local midnight. */
async function runsToday(admin: SupabaseClient, tenantId: string, midnightUtcIso: string): Promise<number> {
  const { count } = await admin
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", midnightUtcIso);
  return count ?? 0;
}

/**
 * Execute all due schedules. Safe to call on any cron cadence — the daily
 * limit + local-midnight window make repeat ticks idempotent.
 */
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
    try {
      const { settings, projectId, budget } = await loadTenantSettings(admin, s.tenant_id);
      await runStoryGeneration({
        tenantId: s.tenant_id,
        topicInput: null,
        settings,
        projectId,
        perVideoBudgetUsd: budget,
        mode: "dry",
        client: admin,
      });
      summary.triggered++;
      summary.details.push({ tenantId: s.tenant_id, result: "triggered" });
    } catch (err) {
      summary.errors++;
      summary.details.push({
        tenantId: s.tenant_id,
        result: "error",
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return summary;
}
