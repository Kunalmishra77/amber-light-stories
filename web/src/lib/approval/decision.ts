import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEffectivePolicy, type PolicyLayer } from "@/lib/security/policy";

/**
 * Approval Decision Layer (M15 O2 — ADR-080/081/083).
 *
 * Fixes a REAL safety defect found in the M15 audit: M12 wrote
 * `quality_scores.action` and `compliance_checks.status`, but no code path read
 * them — so a "blocked" verdict blocked nothing. THIS module is the single
 * place every state-advancing path must consult.
 *
 * Reuses (does not duplicate): M12 quality/compliance verdicts, M11 cost
 * governor semantics, M12 content memory for first-run, and the M13/M14
 * versioned + layered + tighten-only policy shape.
 *
 * INVARIANT: no decision without evidence, and no evidence without a persisted,
 * append-only decision record (enforced by DB triggers).
 */
export type OperatingMode = "manual" | "semi_auto" | "full_auto";
export type Decision = "approved" | "rejected" | "manual_review" | "blocked";

/**
 * What the caller is trying to do. This matters because the same verdict means
 * different things depending on direction of travel:
 *
 * - `advance` — move the run FORWARD (approve, publish, retry, workflow step).
 *   Every signal applies; a compliance block is absolute.
 * - `remediate` — FIX the content (edit, regenerate, rollback, reject). A
 *   compliance or quality failure must NOT block the very action that repairs
 *   it, otherwise a blocked run becomes permanently unrecoverable. Only
 *   operational stops (emergency stop, exhausted budget) still apply.
 */
export type ApprovalIntent = "advance" | "remediate";

export interface ApprovalPolicyBody {
  mode?: OperatingMode;
  enforce_compliance?: boolean;
  enforce_quality?: boolean;
  quality_manual_review?: boolean;
  first_run_requires_review?: boolean;
  respect_cost_governor?: boolean;
  stage_matrix?: Record<string, "required" | "optional" | "auto" | "conditional">;
}

export interface ApprovalEvidence {
  quality: { verdict: string | null; score: number | null; action: string | null };
  compliance: { verdict: string | null; blocking: number };
  cost: { verdict: string; spentUsd: number | null; budgetUsd: number | null };
  firstRun: boolean;
  runPaused: boolean;
  /** This workspace's own stop. */
  emergencyStop: boolean;
  /** The platform-wide stop — halts every tenant at once (M15 O4). */
  platformStop: boolean;
  stageApprovalType: string;
  /**
   * A human already approved this stage. Automation may then carry out the
   * approved work — but the hard gates above are re-evaluated at execution
   * time, so a compliance block landing after approval still stops it.
   */
  humanApproved: boolean;
}

export interface ApprovalOutcome {
  decision: Decision;
  mode: OperatingMode;
  reasons: string[];
  evidence: ApprovalEvidence;
  policyVersion: number | null;
  /** True when a human may proceed; false means the action must be refused. */
  allowed: boolean;
}

/** Tighten-only merge of the platform → tenant approval policy. */
export async function resolveApprovalPolicy(
  db: SupabaseClient,
  tenantId: string
): Promise<{ body: ApprovalPolicyBody; version: number | null }> {
  const { data } = await db
    .from("approval_policies")
    .select("scope_type, scope_id, approval_policy_versions!approval_policies_active_fk(version, body)")
    .or(`scope_type.eq.platform,scope_id.eq.${tenantId}`);

  const layers: PolicyLayer[] = [];
  let version: number | null = null;
  for (const row of (data ?? []) as Array<{
    scope_type: string;
    approval_policy_versions: { version: number; body: ApprovalPolicyBody } | { version: number; body: ApprovalPolicyBody }[] | null;
  }>) {
    const v = Array.isArray(row.approval_policy_versions) ? row.approval_policy_versions[0] : row.approval_policy_versions;
    if (!v?.body) continue;
    layers.push({ scopeType: row.scope_type as PolicyLayer["scopeType"], body: v.body as Record<string, unknown> });
    if (row.scope_type === "tenant" || version === null) version = v.version;
  }
  if (layers.length === 0) {
    // Fail SAFE: with no policy resolvable, enforce compliance and require review.
    return { body: { mode: "manual", enforce_compliance: true, quality_manual_review: true }, version: null };
  }
  return { body: resolveEffectivePolicy(layers).effective as ApprovalPolicyBody, version };
}

/**
 * Gather the real signals for a stage. Every field comes from data another
 * subsystem already produced — nothing is invented here.
 */
export async function gatherEvidence(
  db: SupabaseClient,
  input: { tenantId: string; runId: string | null; stageName: string; policy: ApprovalPolicyBody }
): Promise<ApprovalEvidence> {
  const { isPlatformStopped } = await import("@/lib/ops/platform-stop");
  const [qualityRes, complianceRes, runRes, scheduleRes, memoryRes, humanRes, platformStop] =
    await Promise.all([
    input.runId
      ? db.from("quality_scores").select("overall, passed, action").eq("run_id", input.runId).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as unknown[] }),
    input.runId
      ? db.from("compliance_checks").select("status, blocking_count, gate").eq("run_id", input.runId).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as unknown[] }),
    input.runId
      ? db.from("pipeline_runs").select("status, total_cost_usd, budget_usd").eq("id", input.runId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("schedules").select("emergency_stop").eq("tenant_id", input.tenantId).maybeSingle(),
    db.from("content_memory").select("id", { count: "exact", head: true }).eq("tenant_id", input.tenantId).eq("kind", "topic"),
    input.runId
      ? db
          .from("approval_decisions")
          .select("id", { count: "exact", head: true })
          .eq("run_id", input.runId)
          .eq("stage", input.stageName)
          .eq("decision", "approved")
          .eq("actor_type", "user")
      : Promise.resolve({ count: 0 }),
    isPlatformStopped(db),
  ]);

  const q = ((qualityRes.data ?? []) as Array<{ overall: number; passed: boolean; action: string }>)[0];
  const c = ((complianceRes.data ?? []) as Array<{ status: string; blocking_count: number }>)[0];
  const run = (runRes as { data: { status: string; total_cost_usd: number | null; budget_usd: number | null } | null }).data;
  const sched = (scheduleRes as { data: { emergency_stop: boolean } | null }).data;
  const memoryCount = (memoryRes as { count?: number | null }).count ?? 0;

  const spent = run?.total_cost_usd ?? null;
  const budget = run?.budget_usd ?? null;
  const overBudget = spent !== null && budget !== null && Number(spent) > Number(budget);

  return {
    quality: { verdict: q ? (q.passed ? "passed" : "failed") : null, score: q?.overall ?? null, action: q?.action ?? null },
    compliance: { verdict: c?.status ?? null, blocking: c?.blocking_count ?? 0 },
    cost: { verdict: overBudget ? "over_budget" : "within_budget", spentUsd: spent, budgetUsd: budget },
    firstRun: memoryCount === 0,
    runPaused: run?.status === "paused",
    emergencyStop: Boolean(sched?.emergency_stop),
    platformStop: Boolean(platformStop),
    stageApprovalType: input.policy.stage_matrix?.[input.stageName] ?? "conditional",
    humanApproved: (((humanRes as { count?: number | null }).count) ?? 0) > 0,
  };
}

/**
 * PURE decision function — the enforcement rules, unit-testable in isolation.
 * Ordering matters: hard blocks are evaluated before anything permissive.
 */
export function decide(
  evidence: ApprovalEvidence,
  policy: ApprovalPolicyBody,
  actor: { isAutomation: boolean; intent?: ApprovalIntent }
): { decision: Decision; reasons: string[]; allowed: boolean } {
  const reasons: string[] = [];
  const mode: OperatingMode = policy.mode ?? "semi_auto";
  const intent: ApprovalIntent = actor.intent ?? "advance";

  // 1) Stops — nothing proceeds, in either direction.
  if (evidence.platformStop) {
    return {
      decision: "blocked",
      reasons: ["a platform-wide stop is in effect — all workspaces are halted"],
      allowed: false,
    };
  }
  if (evidence.emergencyStop) {
    return { decision: "blocked", reasons: ["emergency stop is active for this workspace"], allowed: false };
  }

  // 2) Compliance BLOCKED is a hard block and can never be approved away.
  if (intent === "advance" && evidence.compliance.verdict === "blocked" && policy.enforce_compliance !== false) {
    return {
      decision: "blocked",
      reasons: [`compliance blocked this run (${evidence.compliance.blocking} blocking finding(s)) — approval cannot bypass a compliance block`],
      allowed: false,
    };
  }

  // 3) Cost governor — respect M11 semantics; never invent a second budget.
  //    Applies to remediation too: regenerating costs real money.
  if (policy.respect_cost_governor !== false && evidence.cost.verdict === "over_budget") {
    return {
      decision: "blocked",
      reasons: [`run exceeded its budget ($${evidence.cost.spentUsd} of $${evidence.cost.budgetUsd})`],
      allowed: false,
    };
  }

  // Remediation stops here: fixing content must stay possible while a run is
  // blocked, paused, or failing quality — that is the whole point of fixing it.
  if (intent === "remediate") {
    reasons.push("remediation permitted: no operational stop in effect");
    return { decision: "approved", reasons, allowed: true };
  }

  // 4) Quality — blocked/failed is hard only when enforcement is switched on
  //    (warn-then-enforce); manual_review always routes to a human.
  if (evidence.quality.action === "block" || (evidence.quality.verdict === "failed" && policy.enforce_quality)) {
    return { decision: "blocked", reasons: [`quality gate failed (score ${evidence.quality.score})`], allowed: false };
  }
  if (evidence.quality.action === "manual_review" && policy.quality_manual_review !== false) {
    reasons.push("quality gate requires human review");
    return { decision: "manual_review", reasons, allowed: !actor.isAutomation };
  }
  if (evidence.quality.verdict === "failed" && !policy.enforce_quality) {
    reasons.push(`quality below threshold (score ${evidence.quality.score}) — warning only under current policy`);
  }

  // 5) Compliance warnings route to review rather than blocking.
  if (evidence.compliance.verdict === "manual_review") {
    reasons.push("compliance findings require human review");
    return { decision: "manual_review", reasons, allowed: !actor.isAutomation };
  }

  // 6) Paused runs must be resumed deliberately.
  if (evidence.runPaused) {
    return { decision: "blocked", reasons: ["run is paused — resume it before advancing"], allowed: false };
  }

  // Automation carrying out work a human already approved has cleared the
  // human-in-the-loop requirements below. It has NOT cleared the hard gates
  // above — those are re-evaluated at execution time on purpose.
  if (actor.isAutomation && evidence.humanApproved) {
    reasons.push("carrying out work explicitly approved by a reviewer");
    return { decision: "approved", reasons, allowed: true };
  }

  // 7) First run is a REVIEW signal, never an unconditional block.
  if (evidence.firstRun && policy.first_run_requires_review !== false && actor.isAutomation) {
    reasons.push("first run for this workspace requires human review");
    return { decision: "manual_review", reasons, allowed: false };
  }

  // 8) Stage matrix + mode.
  if (evidence.stageApprovalType === "required" && actor.isAutomation && mode !== "full_auto") {
    reasons.push(`stage requires explicit human approval under ${mode} mode`);
    return { decision: "manual_review", reasons, allowed: false };
  }
  if (mode === "manual" && actor.isAutomation) {
    reasons.push("manual mode: automation may not advance stages");
    return { decision: "manual_review", reasons, allowed: false };
  }

  reasons.push(reasons.length === 0 ? "all approval signals satisfied" : "proceeding with warnings");
  return { decision: "approved", reasons, allowed: true };
}

/**
 * Evaluate AND record. Every call persists an append-only decision record with
 * its evidence — the DB rejects a record lacking evidence or reasons.
 */
export async function evaluateApproval(input: {
  tenantId: string;
  runId: string | null;
  stageId: string | null;
  stageName: string;
  actorId?: string | null;
  isAutomation?: boolean;
  intent?: ApprovalIntent;
  /**
   * Force the RECORDED decision (not the computed one). Used by explicit human
   * rejection, which is always permitted but must still be captured with the
   * same evidence as any other decision.
   */
  recordAs?: Decision;
  /**
   * Set false to evaluate WITHOUT writing a decision record. Only for showing a
   * reviewer what would happen — looking at a verdict is not a decision, and
   * persisting page views would bury the real decisions in noise. Any call that
   * actually changes state must persist.
   */
  persist?: boolean;
  client?: SupabaseClient;
  correlationId?: string | null;
}): Promise<ApprovalOutcome> {
  const db = input.client ?? createAdminClient();
  const { body: policy, version } = await resolveApprovalPolicy(db, input.tenantId);
  const evidence = await gatherEvidence(db, {
    tenantId: input.tenantId,
    runId: input.runId,
    stageName: input.stageName,
    policy,
  });
  const isAutomation = input.isAutomation ?? false;
  const intent = input.intent ?? "advance";
  const computed = decide(evidence, policy, { isAutomation, intent });
  const decision = input.recordAs ?? computed.decision;
  const reasons = input.recordAs
    ? [`explicit ${input.recordAs} by ${isAutomation ? "automation" : "reviewer"}`, ...computed.reasons]
    : computed.reasons;
  const allowed = input.recordAs === "rejected" ? true : computed.allowed;

  if (input.persist !== false) {
    await db.from("approval_decisions").insert({
      tenant_id: input.tenantId,
      run_id: input.runId,
      stage_id: input.stageId,
      stage: input.stageName,
      decision,
      mode: policy.mode ?? "semi_auto",
      actor_id: input.actorId ?? null,
      actor_type: isAutomation ? "automation" : "user",
      quality_verdict: evidence.quality.verdict,
      quality_score: evidence.quality.score,
      compliance_verdict: evidence.compliance.verdict,
      compliance_blocking: evidence.compliance.blocking,
      cost_verdict: evidence.cost.verdict,
      first_run: evidence.firstRun,
      policy_version: version,
      evidence: evidence as unknown as Record<string, unknown>,
      reasons,
      intent,
      resulting_action: allowed ? (intent === "remediate" ? "remediate" : "advance") : "halt",
      correlation_id: input.correlationId ?? null,
    });
  }

  return { decision, mode: policy.mode ?? "semi_auto", reasons, evidence, policyVersion: version, allowed };
}

/**
 * Cheap "is anything stopped?" check for automated paths that launch work but
 * aren't tied to a single pipeline stage (the workflow DAG runner). A stop that
 * only halted stage approvals while workflows kept launching jobs would not be
 * a stop at all.
 */
export async function isHalted(
  db: SupabaseClient,
  tenantId: string | null
): Promise<{ halted: boolean; reason: string | null }> {
  const { isPlatformStopped } = await import("@/lib/ops/platform-stop");
  if (await isPlatformStopped(db)) {
    return { halted: true, reason: "a platform-wide stop is in effect" };
  }
  if (!tenantId) return { halted: false, reason: null };

  const { data } = await db
    .from("schedules")
    .select("emergency_stop")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ emergency_stop: boolean }>();
  return data?.emergency_stop
    ? { halted: true, reason: "emergency stop is active for this workspace" }
    : { halted: false, reason: null };
}

/** Thrown by any path that attempts to advance against a refused decision. */
export class ApprovalRefusedError extends Error {
  readonly decision: Decision;
  readonly reasons: string[];
  constructor(outcome: ApprovalOutcome) {
    super(`${outcome.decision}: ${outcome.reasons.join("; ")}`);
    this.name = "ApprovalRefusedError";
    this.decision = outcome.decision;
    this.reasons = outcome.reasons;
  }
}
