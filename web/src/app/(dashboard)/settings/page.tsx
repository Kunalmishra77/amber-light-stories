import { SlidersHorizontal, Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { getTenantBrand } from "@/lib/branding";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "./section-card";
import { STAGE_ORDER } from "@/lib/pipeline/stage-content";
import { ProjectSettingsForm, type ProjectSettingsData } from "./project-settings-form";
import { WorkspaceSummary } from "./workspace-summary";
import { BusinessForm } from "./business-form";
import { RegionForm } from "./region-form";
import { ContentForm } from "./content-form";
import { VoiceForm } from "./voice-form";
import { AutomationSummary } from "./automation-summary";
import { NotificationsForm } from "./notifications-form";
import { LinkGrid } from "./link-grid";
import { SettingsNav } from "./settings-nav";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

const AUTO_APPROVE_STAGES = STAGE_ORDER.filter(
  (stage) => !["human_review", "schedule", "publish"].includes(stage)
);

interface TenantSettingsRow {
  industry: string | null;
  audience: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
  language: string | null;
  secondary_language: string | null;
  timezone: string | null;
  country: string | null;
  currency: string | null;
  date_format: string | null;
  content_style: string | null;
  tone: string | null;
  upload_frequency: string | null;
  target_platform: string | null;
  keywords: string[] | null;
  negative_keywords: string[] | null;
  competitors: string[] | null;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: settings, error: settingsError }, brand, canEdit, { data: voices }, { data: project }] =
    await Promise.all([
      supabase
        .from("tenant_settings")
        .select(
          "industry, audience, config, language, secondary_language, timezone, country, currency, date_format, content_style, tone, upload_frequency, target_platform, keywords, negative_keywords, competitors"
        )
        .eq("tenant_id", tenantId)
        .maybeSingle<TenantSettingsRow>(),
      getTenantBrand(tenantId),
      isOwnerOrManager(tenantId),
      supabase
        .from("voices")
        .select("id, name, provider, language")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      supabase
        .from("projects")
        .select("id, per_video_budget_usd, language, target_seconds, aspect_ratio, niche, auto_approve")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle<ProjectSettingsData>(),
    ]);

  if (settingsError || !settings) {
    return (
      <div>
        <PageHeader title="Settings" description="Everything that shapes this workspace, in one place." />
        <EmptyState
          icon={SettingsIcon}
          title="Couldn't load settings"
          description="There was a problem reaching the tenant_settings table. Check your Supabase connection."
        />
      </div>
    );
  }

  const config = settings.config ?? {};
  const audience = settings.audience ?? {};
  const business = (config.business ?? {}) as { goals?: string | null; objective?: string | null };

  const automationEnabled = Boolean((config as { automation_enabled?: boolean }).automation_enabled);
  const defaultVoiceId = ((config as { default_voice_id?: string | null }).default_voice_id ?? "") as string;
  const notificationPrefs = {
    on_publish: Boolean((config as { notifications?: { on_publish?: boolean } }).notifications?.on_publish),
    on_approval_needed: Boolean(
      (config as { notifications?: { on_approval_needed?: boolean } }).notifications?.on_approval_needed
    ),
    on_failure: Boolean((config as { notifications?: { on_failure?: boolean } }).notifications?.on_failure),
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Everything that shapes this workspace — identity, content rules, automation, and account."
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <SettingsNav />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <WorkspaceSummary displayName={brand.display_name} tagline={brand.tagline} />

          <BusinessForm
            data={{
              industry: settings.industry ?? "",
              target_audience: (audience as { target_audience?: string | null }).target_audience ?? "",
              business_goals: business.goals ?? "",
              content_objective: business.objective ?? "",
            }}
            canEdit={canEdit}
          />

          <RegionForm
            data={{
              language: settings.language ?? "en",
              secondary_language: settings.secondary_language ?? "",
              timezone: settings.timezone ?? "UTC",
              country: settings.country ?? "",
              currency: settings.currency ?? "USD",
              date_format: settings.date_format ?? "YYYY-MM-DD",
            }}
            canEdit={canEdit}
          />

          <ContentForm
            data={{
              content_style: settings.content_style ?? "",
              tone: settings.tone ?? "",
              keywords: (settings.keywords ?? []).join(", "),
              negative_keywords: (settings.negative_keywords ?? []).join(", "),
              competitors: (settings.competitors ?? []).join(", "),
              upload_frequency: settings.upload_frequency ?? "",
              target_platform: settings.target_platform ?? "youtube_shorts",
            }}
            canEdit={canEdit}
          />

          <VoiceForm voices={voices ?? []} defaultVoiceId={defaultVoiceId} canEdit={canEdit} />

          <AutomationSummary enabled={automationEnabled} canEdit={canEdit} />

          <NotificationsForm preferences={notificationPrefs} canEdit={canEdit} />

          <SectionCard
            id="production"
            icon={SlidersHorizontal}
            title="Production defaults"
            description="Per-video budget, output format, and the pipeline's auto-approval matrix."
          >
            {project ? (
              <ProjectSettingsForm project={project} stages={AUTO_APPROVE_STAGES} />
            ) : (
              <p className="text-xs text-muted-foreground">
                No project row found yet for this workspace — production defaults will appear here once one exists.
              </p>
            )}
          </SectionCard>

          <LinkGrid />
        </div>
      </div>
    </div>
  );
}
