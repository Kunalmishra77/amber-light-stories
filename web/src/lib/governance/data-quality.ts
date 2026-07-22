import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data Quality Engine (M14 B6 — R1-06). REAL deterministic integrity checks
 * over the live schema — orphaned references, unattributed tenant rows,
 * duplicates, and governance drift. No AI, no heuristics, no invented scores:
 * every finding is a SQL fact with the offending count as its evidence.
 */
/**
 * The checks that matter for THIS schema. Each returns a single integer count
 * of violating rows — deterministic and cheap.
 */
/**
 * The checks live in the DB function `run_data_quality_checks()` — hardcoded
 * server-side. The application can only ask to RUN them, never supply SQL.
 */
export interface QualityFinding {
  check_key: string;
  resource: string;
  severity: string;
  count: number;
  description: string;
}

/**
 * Run every check and persist any non-zero result. Idempotent per pass: an
 * existing open finding for the same (check, resource) is updated, not
 * duplicated.
 */
export async function runDataQualityChecks(
  opts?: { persist?: boolean }
): Promise<{ findings: QualityFinding[]; checked: number; failedChecks: number }> {
  const admin = createAdminClient();
  const findings: QualityFinding[] = [];
  let failedChecks = 0;

  const { data, error } = await admin.rpc("run_data_quality_checks");
  if (error) {
    failedChecks = 1;
  } else {
    for (const row of (data ?? []) as Array<{ check_key: string; resource: string; severity: string; violations: number; description: string }>) {
      const count = Number(row.violations ?? 0);
      if (count > 0) {
        findings.push({
          check_key: row.check_key,
          resource: row.resource,
          severity: row.severity,
          count,
          description: row.description,
        });
      }
    }
  }

  if (opts?.persist !== false) {
    for (const f of findings) {
      const { data: existing } = await admin
        .from("data_quality_findings")
        .select("id")
        .eq("check_key", f.check_key)
        .eq("resource", f.resource)
        .eq("status", "open")
        .is("tenant_id", null)
        .maybeSingle();
      if (existing) {
        await admin
          .from("data_quality_findings")
          .update({ count: f.count, evidence: { description: f.description }, detected_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await admin.from("data_quality_findings").insert({
          check_key: f.check_key,
          resource: f.resource,
          severity: f.severity,
          count: f.count,
          evidence: { description: f.description },
        });
      }
    }
  }

  return { findings, checked: 8, failedChecks };
}
