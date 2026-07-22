import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordDecision } from "@/lib/ai-gateway/decisions";
import { evaluateQuality, type QualityDimensionConfig, type QualityInput, type QualityResult } from "@/lib/quality/engine";
import { evaluateCompliance, type ComplianceInput, type ComplianceResult } from "@/lib/quality/compliance";

/**
 * Gate execution + persistence (M12 G3). Runs the rules engines, stores the
 * explainable result, and records the decision for audit (ADR-037). Gates are
 * the enforcement points named by ADR-042/044 — quality after planning,
 * compliance pre-render and pre-publish.
 */

/** Tenant dimension config, falling back to the platform defaults. */
export async function loadQualityDimensions(
  tenantId: string,
  client?: SupabaseClient
): Promise<QualityDimensionConfig[]> {
  const sb = client ?? createAdminClient();
  const { data } = await sb
    .from("quality_dimensions")
    .select("tenant_id, key, label, weight, min_score, blocking, enabled")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("enabled", true);

  const rows = (data ?? []) as Array<QualityDimensionConfig & { tenant_id: string | null }>;
  // A tenant override replaces the platform default for the same key.
  const byKey = new Map<string, QualityDimensionConfig & { tenant_id: string | null }>();
  for (const r of rows) {
    const existing = byKey.get(r.key);
    if (!existing || (existing.tenant_id === null && r.tenant_id !== null)) byKey.set(r.key, r);
  }
  return Array.from(byKey.values()).map(({ key, label, weight, min_score, blocking }) => ({
    key,
    label,
    weight: Number(weight),
    min_score: Number(min_score),
    blocking,
  }));
}

export async function runQualityGate(
  input: {
    tenantId: string;
    runId: string | null;
    storyId: string | null;
    stage: string;
    quality: QualityInput;
  },
  client?: SupabaseClient
): Promise<QualityResult> {
  const sb = client ?? createAdminClient();
  const configs = await loadQualityDimensions(input.tenantId, sb);
  const result = evaluateQuality(input.quality, configs);

  await sb.from("quality_scores").insert({
    tenant_id: input.tenantId,
    run_id: input.runId,
    story_id: input.storyId,
    stage: input.stage,
    overall: result.overall,
    passed: result.passed,
    dimensions: result.dimensions,
    action: result.action,
    regenerate_scope: result.regenerateScope,
    evaluator: result.evaluator,
  });

  await recordDecision({
    tenantId: input.tenantId,
    decisionType: "quality_gate",
    chosen: { action: result.action, overall: result.overall, passed: result.passed },
    alternatives: result.dimensions
      .filter((d) => !d.passed)
      .map((d) => ({ dimension: d.key, score: d.score, min: d.min, evidence: d.evidence })),
    signals: { stage: input.stage, evaluator: result.evaluator, dimensionCount: result.dimensions.length },
    rationale: result.passed
      ? `All ${result.dimensions.length} dimensions passed (overall ${result.overall}).`
      : `Failed: ${result.dimensions.filter((d) => !d.passed).map((d) => d.key).join(", ")}.`,
    runId: input.runId,
  });

  return result;
}

export async function runComplianceGate(
  input: {
    tenantId: string;
    runId: string | null;
    storyId: string | null;
    compliance: ComplianceInput;
  },
  client?: SupabaseClient
): Promise<ComplianceResult> {
  const sb = client ?? createAdminClient();
  const result = evaluateCompliance(input.compliance);

  await sb.from("compliance_checks").insert({
    tenant_id: input.tenantId,
    run_id: input.runId,
    story_id: input.storyId,
    gate: result.gate,
    status: result.status,
    findings: result.findings,
    blocking_count: result.blockingCount,
    evaluator: result.evaluator,
  });

  await recordDecision({
    tenantId: input.tenantId,
    decisionType: "compliance_gate",
    chosen: { gate: result.gate, status: result.status, blockingCount: result.blockingCount },
    alternatives: result.findings.map((f) => ({ rule: f.rule, severity: f.severity, message: f.message })),
    signals: { gate: result.gate, evaluator: result.evaluator, audienceMode: input.compliance.audienceMode ?? "general" },
    rationale:
      result.status === "passed"
        ? "No policy findings."
        : `${result.blockingCount} blocking finding(s): ${result.findings.filter((f) => f.severity === "blocking").map((f) => f.rule).join(", ")}.`,
    runId: input.runId,
  });

  // M15 O4 — a blocked run is an operational condition someone must act on.
  // The attached playbook says explicitly that a block can only be fixed, never
  // approved away.
  if (result.status === "blocked") {
    const { raiseIncident } = await import("@/lib/ops/incidents");
    await raiseIncident({
      tenantId: input.tenantId,
      title: `Compliance blocked a run at the ${result.gate} gate`,
      summary: `${result.blockingCount} blocking finding(s): ${result.findings
        .filter((f) => f.severity === "blocking")
        .map((f) => f.rule)
        .join(", ")}.`,
      severity: "high",
      source: "quality.block",
      dedupeKey: input.runId ? `compliance.block:${input.runId}:${result.gate}` : null,
      runId: input.runId,
      client: sb,
    });
  }

  return result;
}
