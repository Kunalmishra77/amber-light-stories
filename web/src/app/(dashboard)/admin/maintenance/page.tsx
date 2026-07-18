import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MaintenanceForm } from "./maintenance-form";

// Single-row maintenance switch — reads live on every request.
export const dynamic = "force-dynamic";

interface MaintenanceRow {
  enabled: boolean;
  message: string | null;
}

async function loadMaintenance() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance")
    .select("enabled, message")
    .eq("id", 1)
    .maybeSingle<MaintenanceRow>();

  if (error) throw error;
  return data;
}

export default async function AdminMaintenancePage() {
  let row: MaintenanceRow | null = null;
  let errored = false;

  try {
    row = await loadMaintenance();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Toggle platform-wide maintenance mode and the message shown to tenants."
      />

      {row?.enabled ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--status-failed)]/30 bg-[var(--status-failed)]/10 px-4 py-3">
          <Wrench
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-failed)]"
            strokeWidth={1.75}
          />
          <p className="text-sm text-foreground">
            Maintenance mode is currently <strong>ON</strong>.
          </p>
        </div>
      ) : null}

      {errored || !row ? (
        <EmptyState
          icon={Wrench}
          title="Couldn't load maintenance settings"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : (
        <MaintenanceForm enabled={row.enabled} message={row.message} />
      )}
    </div>
  );
}
