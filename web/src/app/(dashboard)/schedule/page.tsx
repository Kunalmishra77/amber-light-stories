import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ScheduleForm, type ScheduleData } from "./schedule-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: schedule }, { data: settings }] = await Promise.all([
    supabase
      .from("schedules")
      .select(
        "id, timezone, days, publish_times, frequency, pause_dates, holiday_mode, emergency_stop, retry_rules, upload_limit_per_day"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle<ScheduleData>(),
    supabase
      .from("tenant_settings")
      .select("timezone")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ timezone: string | null }>(),
  ]);

  const initial: ScheduleData = schedule ?? {
    id: null,
    timezone: settings?.timezone ?? "UTC",
    days: [1, 2, 3, 4, 5],
    publish_times: ["09:00"],
    frequency: "daily",
    pause_dates: [],
    holiday_mode: false,
    emergency_stop: false,
    retry_rules: { max_retries: 3, backoff: "linear" },
    upload_limit_per_day: 1,
  };

  return (
    <div>
      <PageHeader
        title="Scheduler"
        description="Control when and how often this workspace publishes."
      />
      <ScheduleForm initial={initial} />
    </div>
  );
}
