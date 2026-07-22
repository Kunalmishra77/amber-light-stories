import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Operational analytics, SLAs and the Workspace Health Score (M15 O6).
 *
 * COMPUTED ON READ from the tables that already hold the truth — pipeline_stages,
 * jobs, security_incidents, approval_decisions. No metrics store, no rollup
 * tables, no second copy of the numbers to drift out of sync. At current volume
 * these are trivially cheap queries; if that changes, the fix is caching, not a
 * parallel analytics database.
 */
export type SlaMetric =
  | "review_latency"
  | "publish_latency"
  | "incident_ack"
  | "incident_resolve"
  | "job_success_rate";

export interface SlaDefinition {
  id: string;
  tenant_id: string | null;
  slug: string;
  title: string;
  metric: string;
  target_minutes: number | null;
  target_ratio: number | null;
  severity: string;
  enabled: boolean;
}

export interface SlaResult {
  slug: string;
  title: string;
  metric: string;
  severity: string;
  /** 0..1 share of measured items that met the target. Null when nothing was measurable. */
  attainment: number | null;
  target: string;
  observed: string;
  breaching: number;
  sampleSize: number;
  met: boolean | null;
}

export interface WorkspaceHealth {
  score: number;                    // 0..100
  band: "healthy" | "attention" | "at_risk";
  components: { key: string; label: string; score: number; weight: number; detail: string }[];
  slas: SlaResult[];
  openIncidents: number;
  breachedIncidents: number;
  reviewBacklog: number;
  oldestReviewHours: number | null;
}

/** Platform defaults are used unless the tenant has published its own. */
export async function loadSlaDefinitions(
  db: SupabaseClient,
  tenantId: string
): Promise<SlaDefinition[]> {
  const { data } = await db
    .from("sla_definitions")
    .select("id, tenant_id, slug, title, metric, target_minutes, target_ratio, severity, enabled")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("enabled", true);

  const rows = (data ?? []) as SlaDefinition[];
  const bySlug = new Map<string, SlaDefinition>();
  for (const row of rows) {
    const existing = bySlug.get(row.slug);
    // A tenant-published SLA overrides the platform baseline of the same slug.
    if (!existing || (!existing.tenant_id && row.tenant_id)) bySlug.set(row.slug, row);
  }
  return Array.from(bySlug.values());
}

const WINDOW_DAYS = 30;

function windowStart(): string {
  return new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
}

function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

function fmtMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
}

/**
 * Evaluates one SLA against real rows. Returns `attainment: null` when there is
 * nothing to measure — an empty workspace is not a failing workspace, and
 * scoring it as 0% would be a lie.
 */
async function evaluateSla(
  db: SupabaseClient,
  tenantId: string,
  sla: SlaDefinition
): Promise<SlaResult> {
  const base = {
    slug: sla.slug,
    title: sla.title,
    metric: sla.metric,
    severity: sla.severity,
  };
  const since = windowStart();

  switch (sla.metric as SlaMetric) {
    case "review_latency": {
      // Time a stage spent awaiting review before it was approved or rejected.
      const { data } = await db
        .from("pipeline_stages")
        .select("updated_at, approved_at, created_at, status")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .in("status", ["done", "rejected"])
        .not("approved_at", "is", null)
        .limit(500);
      const rows = (data ?? []) as { created_at: string; approved_at: string }[];
      const latencies = rows.map((r) => minutesBetween(r.created_at, r.approved_at));
      return summarise(base, latencies, sla.target_minutes);
    }

    case "publish_latency": {
      const { data } = await db
        .from("pipeline_runs")
        .select("started_at, finished_at")
        .eq("tenant_id", tenantId)
        .eq("status", "done")
        .gte("started_at", since)
        .not("finished_at", "is", null)
        .limit(500);
      const rows = (data ?? []) as { started_at: string; finished_at: string }[];
      return summarise(base, rows.map((r) => minutesBetween(r.started_at, r.finished_at)), sla.target_minutes);
    }

    case "incident_ack": {
      const { data } = await db
        .from("security_incidents")
        .select("created_at, acknowledged_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .not("acknowledged_at", "is", null)
        .limit(500);
      const rows = (data ?? []) as { created_at: string; acknowledged_at: string }[];
      return summarise(base, rows.map((r) => minutesBetween(r.created_at, r.acknowledged_at)), sla.target_minutes);
    }

    case "incident_resolve": {
      const { data } = await db
        .from("security_incidents")
        .select("created_at, resolved_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .not("resolved_at", "is", null)
        .limit(500);
      const rows = (data ?? []) as { created_at: string; resolved_at: string }[];
      return summarise(base, rows.map((r) => minutesBetween(r.created_at, r.resolved_at)), sla.target_minutes);
    }

    case "job_success_rate": {
      const [{ count: total }, { count: dead }] = await Promise.all([
        db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", since),
        db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "dead").gte("created_at", since),
      ]);
      const t = total ?? 0;
      const d = dead ?? 0;
      if (t === 0) {
        return { ...base, attainment: null, target: `${pct(sla.target_ratio)}`, observed: "no jobs yet", breaching: 0, sampleSize: 0, met: null };
      }
      const ratio = (t - d) / t;
      const target = sla.target_ratio ?? 0.95;
      return {
        ...base,
        attainment: ratio,
        target: pct(target),
        observed: pct(ratio),
        breaching: d,
        sampleSize: t,
        met: ratio >= target,
      };
    }

    default:
      return { ...base, attainment: null, target: "—", observed: "unsupported metric", breaching: 0, sampleSize: 0, met: null };
  }
}

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function summarise(
  base: Pick<SlaResult, "slug" | "title" | "metric" | "severity">,
  latencies: number[],
  targetMinutes: number | null
): SlaResult {
  if (latencies.length === 0 || targetMinutes === null) {
    return { ...base, attainment: null, target: fmtMinutes(targetMinutes), observed: "nothing measured yet", breaching: 0, sampleSize: 0, met: null };
  }
  const withinTarget = latencies.filter((m) => m <= targetMinutes).length;
  const attainment = withinTarget / latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)];
  return {
    ...base,
    attainment,
    target: fmtMinutes(targetMinutes),
    observed: `median ${fmtMinutes(p50)}`,
    breaching: latencies.length - withinTarget,
    sampleSize: latencies.length,
    met: attainment >= 0.95,
  };
}

/**
 * The Workspace Health Score. Deliberately explainable: every component states
 * what it measured and what it contributed, so a low score always comes with
 * the reason. A score with no explanation is just a number people learn to
 * ignore.
 */
export async function getWorkspaceHealth(
  db: SupabaseClient,
  tenantId: string
): Promise<WorkspaceHealth> {
  const [definitions, incidentsRes, breachedRes, backlogRes] = await Promise.all([
    loadSlaDefinitions(db, tenantId),
    db.from("security_incidents").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).in("status", ["open", "acknowledged", "investigating"]),
    db.from("security_incidents").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("sla_breached", true).in("status", ["open", "acknowledged", "investigating"]),
    db.from("pipeline_stages").select("created_at")
      .eq("tenant_id", tenantId).eq("status", "awaiting_review")
      .order("created_at", { ascending: true }).limit(200),
  ]);

  const slas = await Promise.all(definitions.map((d) => evaluateSla(db, tenantId, d)));

  const openIncidents = incidentsRes.count ?? 0;
  const breachedIncidents = breachedRes.count ?? 0;
  const backlogRows = (backlogRes.data ?? []) as { created_at: string }[];
  const reviewBacklog = backlogRows.length;
  const oldestReviewHours = backlogRows.length
    ? minutesBetween(backlogRows[0].created_at, new Date().toISOString()) / 60
    : null;

  const measured = slas.filter((s) => s.attainment !== null);
  const slaScore = measured.length
    ? (measured.reduce((sum, s) => sum + (s.attainment ?? 0), 0) / measured.length) * 100
    : 100;

  // Each open incident costs 12 points, each SLA-breached one another 10.
  const incidentScore = Math.max(0, 100 - openIncidents * 12 - breachedIncidents * 10);

  // Backlog is judged by AGE, not size: 20 items reviewed same-day is healthy,
  // 2 items sitting for a week is not.
  const backlogScore =
    oldestReviewHours === null
      ? 100
      : oldestReviewHours <= 24
        ? 100
        : oldestReviewHours <= 72
          ? 70
          : oldestReviewHours <= 168
            ? 40
            : 10;

  const components = [
    {
      key: "sla",
      label: "SLA attainment",
      score: Math.round(slaScore),
      weight: 0.4,
      detail: measured.length ? `${measured.length} of ${slas.length} SLAs measurable` : "no SLA data yet",
    },
    {
      key: "incidents",
      label: "Incident load",
      score: Math.round(incidentScore),
      weight: 0.35,
      detail: openIncidents === 0 ? "no open incidents" : `${openIncidents} open, ${breachedIncidents} past SLA`,
    },
    {
      key: "backlog",
      label: "Review backlog",
      score: backlogScore,
      weight: 0.25,
      detail:
        oldestReviewHours === null
          ? "nothing awaiting review"
          : `${reviewBacklog} awaiting review, oldest ${oldestReviewHours.toFixed(0)}h`,
    },
  ];

  const score = Math.round(components.reduce((sum, c) => sum + c.score * c.weight, 0));

  return {
    score,
    band: score >= 80 ? "healthy" : score >= 55 ? "attention" : "at_risk",
    components,
    slas,
    openIncidents,
    breachedIncidents,
    reviewBacklog,
    oldestReviewHours,
  };
}
