import { Activity, AlertOctagon, HeartPulse, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getWorkspaceHealth } from "@/lib/ops/health";
import { getPlaybookForIncident, markBreachedIncidents, type IncidentRow } from "@/lib/ops/incidents";
import { OperationsCenter } from "./operations-center";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  // Breach detection runs on read rather than on a timer: an SLA that is only
  // evaluated by a cron is wrong for exactly as long as the cron is broken.
  await markBreachedIncidents(supabase, tenantId);

  const [health, { data: incidents }, canStop, { data: schedule }] = await Promise.all([
    getWorkspaceHealth(supabase, tenantId),
    supabase
      .from("security_incidents")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    isOwnerOrManager(tenantId),
    supabase.from("schedules").select("emergency_stop").eq("tenant_id", tenantId).maybeSingle<{
      emergency_stop: boolean | null;
    }>(),
  ]);

  const rows = (incidents ?? []) as IncidentRow[];
  const open = rows.filter((i) => ["open", "acknowledged", "investigating"].includes(i.status));

  const playbooks = Object.fromEntries(
    await Promise.all(
      open.map(async (i) => {
        const pb = await getPlaybookForIncident(supabase, i);
        return [i.id, pb ? { ...pb, done: Array.from(pb.done) } : null] as const;
      })
    )
  );

  return (
    <div>
      <PageHeader
        title="Operations"
        description="Incidents, playbooks and service levels for this workspace — one inbox for everything that needs an operator."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workspace health" value={`${health.score}/100`} icon={HeartPulse} />
        <StatCard label="Open incidents" value={health.openIncidents} icon={AlertOctagon} />
        <StatCard label="Past their SLA" value={health.breachedIncidents} icon={Timer} />
        <StatCard label="Awaiting review" value={health.reviewBacklog} icon={Activity} />
      </div>

      <OperationsCenter
        health={health}
        incidents={rows}
        playbooks={playbooks}
        canStop={canStop}
        stopped={Boolean(schedule?.emergency_stop)}
      />
    </div>
  );
}
