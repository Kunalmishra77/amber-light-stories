import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Explainable decision records (M12 G4 / P6-06 — ADR-037). This EXTENDS the
 * existing AI Gateway: the gateway still owns routing, health and breakers —
 * this module only records WHY a choice was made (chosen option, rejected
 * alternatives, the signals considered) so automation is auditable rather than
 * a black box. It is not a second routing system.
 *
 * Never throws: an audit-trail failure must not break the operation it records.
 */
export type DecisionType =
  | "provider_selection"
  | "quality_gate"
  | "compliance_gate"
  | "regeneration_scope";

export interface DecisionInput {
  tenantId: string;
  decisionType: DecisionType;
  chosen: Record<string, unknown>;
  alternatives?: Array<Record<string, unknown>>;
  signals?: Record<string, unknown>;
  policy?: string | null;
  rationale?: string | null;
  costEstimateUsd?: number | null;
  runId?: string | null;
  jobId?: string | null;
  workflowRunId?: string | null;
}

export async function recordDecision(input: DecisionInput): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("decision_records").insert({
      tenant_id: input.tenantId,
      decision_type: input.decisionType,
      chosen: input.chosen ?? {},
      alternatives: input.alternatives ?? [],
      signals: input.signals ?? {},
      policy: input.policy ?? null,
      rationale: input.rationale ?? null,
      cost_estimate_usd: input.costEstimateUsd ?? null,
      run_id: input.runId ?? null,
      job_id: input.jobId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
    });
  } catch {
    // best-effort audit trail
  }
}
