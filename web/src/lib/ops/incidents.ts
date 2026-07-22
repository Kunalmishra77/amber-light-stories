import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTenantOwners } from "@/lib/ops/notify";

/**
 * Operational incidents (M15 O4).
 *
 * EXTENDS the M13 `security_incidents` table rather than adding a second
 * incident model: responders get one inbox, one lifecycle, and one audit trail
 * whether the trigger was a security event or a dead-lettered job. The
 * `category` column is the only thing that differs.
 *
 * Repeats ESCALATE an open incident instead of creating duplicates — enforced
 * by a partial unique index on (tenant_id, dedupe_key) over open statuses, so
 * two concurrent workers cannot both open one.
 */
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "acknowledged" | "investigating" | "resolved" | "closed";

export interface IncidentInput {
  tenantId: string;
  title: string;
  summary?: string | null;
  severity?: IncidentSeverity;
  /** Stable cause identifier, e.g. `job.dead:<jobId>`. Enables escalate-not-duplicate. */
  dedupeKey?: string | null;
  source?: string | null;
  runId?: string | null;
  jobId?: string | null;
  correlationId?: string | null;
  client?: SupabaseClient;
}

export interface IncidentRow {
  id: string;
  tenant_id: string | null;
  title: string;
  severity: string;
  status: string;
  summary: string | null;
  category: string;
  source: string | null;
  run_id: string | null;
  job_id: string | null;
  dedupe_key: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  playbook_id: string | null;
  assigned_to: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  timeline: unknown;
  created_at: string;
}

const OPEN_STATUSES = ["open", "acknowledged", "investigating"];

/** How long an incident of each severity has before its SLA is breached. */
const ACK_MINUTES: Record<IncidentSeverity, number> = {
  critical: 15,
  high: 60,
  medium: 240,
  low: 1440,
};

/**
 * Raise an operational incident, or escalate the existing open one for the same
 * cause. Returns the incident. Never throws — incident bookkeeping must not
 * take down the operation that detected the problem.
 */
export async function raiseIncident(input: IncidentInput): Promise<IncidentRow | null> {
  const db = input.client ?? createAdminClient();
  const severity = input.severity ?? "medium";

  try {
    if (input.dedupeKey) {
      const { data: existing } = await db
        .from("security_incidents")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("dedupe_key", input.dedupeKey)
        .in("status", OPEN_STATUSES)
        .maybeSingle<IncidentRow>();

      if (existing) return await escalate(db, existing, severity, input.summary ?? null);
    }

    const playbookId = input.source ? await resolvePlaybookId(db, input.tenantId, input.source) : null;

    const { data, error } = await db
      .from("security_incidents")
      .insert({
        tenant_id: input.tenantId,
        title: input.title,
        summary: input.summary ?? null,
        severity,
        status: "open",
        category: "operational",
        source: input.source ?? null,
        run_id: input.runId ?? null,
        job_id: input.jobId ?? null,
        dedupe_key: input.dedupeKey ?? null,
        correlation_id: input.correlationId ?? null,
        playbook_id: playbookId,
        sla_due_at: new Date(Date.now() + ACK_MINUTES[severity] * 60_000).toISOString(),
        timeline: [
          { at: new Date().toISOString(), event: "opened", detail: input.source ?? "manual" },
        ],
      })
      .select("*")
      .maybeSingle<IncidentRow>();

    if (error) {
      // Lost the race against a concurrent raise — return the winner.
      if (error.code === "23505" && input.dedupeKey) {
        const { data: winner } = await db
          .from("security_incidents")
          .select("*")
          .eq("tenant_id", input.tenantId)
          .eq("dedupe_key", input.dedupeKey)
          .in("status", OPEN_STATUSES)
          .maybeSingle<IncidentRow>();
        return winner ?? null;
      }
      return null;
    }

    if (data) {
      await notifyTenantOwners(input.tenantId, {
        kind: "incident",
        category: "incident",
        severity: severity === "critical" || severity === "high" ? "critical" : "warning",
        title: `Incident: ${input.title}`,
        body: input.summary ?? null,
        link: `/operations?incident=${data.id}`,
        entityType: "incident",
        entityId: data.id,
        dedupeKey: `incident:${data.id}`,
        client: db,
      });
    }
    return data ?? null;
  } catch {
    return null;
  }
}

/** A repeat occurrence bumps severity and appends to the timeline. */
async function escalate(
  db: SupabaseClient,
  incident: IncidentRow,
  severity: IncidentSeverity,
  detail: string | null
): Promise<IncidentRow> {
  const order: IncidentSeverity[] = ["low", "medium", "high", "critical"];
  const current = order.indexOf(incident.severity as IncidentSeverity);
  const incoming = order.indexOf(severity);
  const next = order[Math.min(order.length - 1, Math.max(current, incoming) + (current >= 0 ? 1 : 0))];

  const timeline = Array.isArray(incident.timeline) ? incident.timeline : [];
  const { data } = await db
    .from("security_incidents")
    .update({
      severity: next ?? incident.severity,
      timeline: [
        ...timeline,
        { at: new Date().toISOString(), event: "recurred", detail: detail ?? "same cause seen again" },
      ],
    })
    .eq("id", incident.id)
    .select("*")
    .maybeSingle<IncidentRow>();
  return data ?? incident;
}

/** Finds the tenant's playbook for a trigger, falling back to the platform baseline. */
async function resolvePlaybookId(
  db: SupabaseClient,
  tenantId: string,
  source: string
): Promise<string | null> {
  const { data } = await db
    .from("ops_playbooks")
    .select("id, tenant_id")
    .eq("trigger_source", source)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  const rows = (data ?? []) as { id: string; tenant_id: string | null }[];
  return rows.find((r) => r.tenant_id === tenantId)?.id ?? rows.find((r) => !r.tenant_id)?.id ?? null;
}

export interface PlaybookStep {
  key: string;
  title: string;
  detail?: string;
}

/** The active playbook for an incident, with the steps already carried out. */
export async function getPlaybookForIncident(
  db: SupabaseClient,
  incident: Pick<IncidentRow, "id" | "playbook_id">
): Promise<{ title: string; version: number; steps: PlaybookStep[]; done: Set<string> } | null> {
  if (!incident.playbook_id) return null;

  const { data: playbook } = await db
    .from("ops_playbooks")
    .select("id, title, active_version_id")
    .eq("id", incident.playbook_id)
    .maybeSingle<{ id: string; title: string; active_version_id: string | null }>();
  if (!playbook?.active_version_id) return null;

  const { data: version } = await db
    .from("ops_playbook_versions")
    .select("version, steps")
    .eq("id", playbook.active_version_id)
    .maybeSingle<{ version: number; steps: PlaybookStep[] }>();
  if (!version) return null;

  const { data: runs } = await db
    .from("ops_playbook_runs")
    .select("step_key")
    .eq("incident_id", incident.id);

  return {
    title: playbook.title,
    version: version.version,
    steps: (version.steps ?? []) as PlaybookStep[],
    done: new Set(((runs ?? []) as { step_key: string }[]).map((r) => r.step_key)),
  };
}

/** Marks the SLA clock as breached for incidents past their due time. */
export async function markBreachedIncidents(db: SupabaseClient, tenantId?: string): Promise<number> {
  let q = db
    .from("security_incidents")
    .update({ sla_breached: true })
    .lt("sla_due_at", new Date().toISOString())
    .eq("sla_breached", false)
    .in("status", OPEN_STATUSES);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data } = await q.select("id");
  return ((data ?? []) as unknown[]).length;
}
