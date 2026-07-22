"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser, isOwnerOrManager } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { raiseIncident } from "@/lib/ops/incidents";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function ctx() {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return null;
  const supabase = await createClient();
  const user = await getSessionUser();
  return { supabase, tenantId, userId: user?.id ?? null };
}

function revalidate() {
  revalidatePath("/operations");
  revalidatePath("/");
}

function appendTimeline(
  timeline: unknown,
  event: string,
  detail: string | null
): unknown[] {
  const existing = Array.isArray(timeline) ? timeline : [];
  return [...existing, { at: new Date().toISOString(), event, detail }];
}

export async function acknowledgeIncident(incidentId: string): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "You're not a member of any workspace." };

  const { data: incident } = await c.supabase
    .from("security_incidents")
    .select("id, timeline, status")
    .eq("id", incidentId)
    .eq("tenant_id", c.tenantId)
    .maybeSingle<{ id: string; timeline: unknown; status: string }>();
  if (!incident) return { ok: false, error: "Incident not found." };

  const { error } = await c.supabase
    .from("security_incidents")
    .update({
      status: incident.status === "open" ? "acknowledged" : incident.status,
      acknowledged_by: c.userId,
      acknowledged_at: new Date().toISOString(),
      assigned_to: c.userId,
      timeline: appendTimeline(incident.timeline, "acknowledged", null),
    })
    .eq("id", incidentId)
    .eq("tenant_id", c.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "ops.acknowledge_incident",
    target: `incident:${incidentId}`,
    meta: {},
    tenantId: c.tenantId,
  });
  revalidate();
  return { ok: true };
}

export async function resolveIncident(
  incidentId: string,
  resolution: string
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "You're not a member of any workspace." };
  const text = resolution.trim();
  // An incident closed with no explanation teaches nobody anything.
  if (!text) return { ok: false, error: "Describe what was done before resolving." };

  const { data: incident } = await c.supabase
    .from("security_incidents")
    .select("id, timeline")
    .eq("id", incidentId)
    .eq("tenant_id", c.tenantId)
    .maybeSingle<{ id: string; timeline: unknown }>();
  if (!incident) return { ok: false, error: "Incident not found." };

  const { error } = await c.supabase
    .from("security_incidents")
    .update({
      status: "resolved",
      resolved_by: c.userId,
      resolved_at: new Date().toISOString(),
      resolution: text,
      timeline: appendTimeline(incident.timeline, "resolved", text),
    })
    .eq("id", incidentId)
    .eq("tenant_id", c.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "ops.resolve_incident",
    target: `incident:${incidentId}`,
    meta: {},
    tenantId: c.tenantId,
  });
  revalidate();
  return { ok: true };
}

/** Records that a playbook step was carried out — the auditable half of a playbook. */
export async function recordPlaybookStep(
  incidentId: string,
  stepKey: string,
  status: "done" | "skipped",
  note?: string
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "You're not a member of any workspace." };

  const { data: incident } = await c.supabase
    .from("security_incidents")
    .select("id, playbook_id")
    .eq("id", incidentId)
    .eq("tenant_id", c.tenantId)
    .maybeSingle<{ id: string; playbook_id: string | null }>();
  if (!incident) return { ok: false, error: "Incident not found." };

  const { error } = await c.supabase.from("ops_playbook_runs").insert({
    tenant_id: c.tenantId,
    incident_id: incidentId,
    playbook_id: incident.playbook_id,
    step_key: stepKey,
    status,
    note: note ?? null,
    actor_id: c.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function createManualIncident(
  title: string,
  summary: string,
  severity: "low" | "medium" | "high" | "critical"
): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "You're not a member of any workspace." };
  if (!title.trim()) return { ok: false, error: "Give the incident a title." };

  const incident = await raiseIncident({
    tenantId: c.tenantId,
    title: title.trim(),
    summary: summary.trim() || null,
    severity,
    source: "manual",
    client: c.supabase as never,
  });
  if (!incident) return { ok: false, error: "Couldn't open the incident." };

  revalidate();
  return { ok: true };
}

/**
 * Workspace-wide stop. Halts every automated path for this tenant: the
 * approval layer refuses to advance anything while it is set, so this is a real
 * stop rather than a flag nothing reads.
 */
export async function setWorkspaceStop(stopped: boolean): Promise<ActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(c.tenantId))) {
    return { ok: false, error: "Only an owner or manager can stop the workspace." };
  }

  const { error } = await c.supabase
    .from("schedules")
    .update({ emergency_stop: stopped })
    .eq("tenant_id", c.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: stopped ? "ops.workspace_stop" : "ops.workspace_resume",
    target: `tenant:${c.tenantId}`,
    meta: {},
    tenantId: c.tenantId,
  });

  if (stopped) {
    await raiseIncident({
      tenantId: c.tenantId,
      title: "Workspace stopped by an operator",
      summary: "All automated advancement is halted until the stop is lifted.",
      severity: "critical",
      source: "manual",
      dedupeKey: `workspace.stop:${c.tenantId}`,
      client: c.supabase as never,
    });
  }

  revalidate();
  return { ok: true };
}
