import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { STAGE_ORDER } from "@/lib/pipeline/stage-content";
import {
  ProjectSettingsForm,
  type ProjectSettingsData,
} from "./project-settings-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

const AUTO_APPROVE_STAGES = STAGE_ORDER.filter(
  (stage) => !["human_review", "schedule", "publish"].includes(stage)
);

export default async function SettingsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let project: ProjectSettingsData | null = null;
  let errored = false;

  try {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, per_video_budget_usd, language, target_seconds, aspect_ratio, niche, auto_approve"
      )
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    project = data;
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Project defaults and the per-stage auto-approval matrix."
      />

      {errored || !project ? (
        <EmptyState
          icon={Settings}
          title={errored ? "Couldn't load project settings" : "No project found"}
          description={
            errored
              ? "There was a problem reaching the projects table. Check your Supabase connection."
              : "Create a project row to configure studio settings."
          }
        />
      ) : (
        <ProjectSettingsForm project={project} stages={AUTO_APPROVE_STAGES} />
      )}
    </div>
  );
}
