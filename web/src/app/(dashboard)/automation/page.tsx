import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardCheck, Send, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { AutomationSwitch, EmergencyStopControl } from "./automation-controls";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

const AUTOMATION_STEPS = [
  { icon: Wand2, label: "Generates content", description: "Drafts stories from your 30-day plan on schedule." },
  { icon: ClipboardCheck, label: "Advances the pipeline", description: "Auto-approves stages you've marked hands-off in Settings." },
  { icon: CalendarClock, label: "Follows your schedule", description: "Publishes on the days & times set in Schedules." },
  { icon: Send, label: "Publishes to YouTube", description: "Uploads finished videos once connected." },
];

export default async function AutomationPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: settings }, { data: schedule }, canEdit] = await Promise.all([
    supabase.from("tenant_settings").select("config").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("schedules").select("emergency_stop").eq("tenant_id", tenantId).maybeSingle<{ emergency_stop: boolean | null }>(),
    isOwnerOrManager(tenantId),
  ]);

  const automationEnabled = Boolean((settings?.config as { automation_enabled?: boolean } | null)?.automation_enabled);
  const emergencyStopped = Boolean(schedule?.emergency_stop);

  return (
    <div>
      <PageHeader
        title="Automation"
        description="The master switch for hands-off content production — from draft generation through to publishing."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AutomationSwitch initialEnabled={automationEnabled} canEdit={canEdit} />
        <EmergencyStopControl initialStopped={emergencyStopped} canEdit={canEdit} />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-elevated p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">What automation does</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {AUTOMATION_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
                <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <Link
        href="/schedule"
        className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover"
      >
        Configure schedule details
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </div>
  );
}
