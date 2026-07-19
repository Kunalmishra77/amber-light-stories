import { Target, Users2, CalendarClock, Tags, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { CONTENT_PILLARS } from "@/lib/planner/mock-plan";
import { RegenerateButton } from "./regenerate-button";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface TenantSettingsRow {
  industry: string | null;
  audience: Record<string, unknown> | null;
  keywords: string[] | null;
  competitors: string[] | null;
  content_style: string | null;
  tone: string | null;
  upload_frequency: string | null;
  config: { strategy?: { pillars?: string[]; cadence?: string; generatedAt?: string; note?: string } } | null;
}

interface ScheduleRow {
  days: number[] | null;
  publish_times: string[] | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StrategyPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: settings }, { data: schedule }, canEdit] = await Promise.all([
    supabase
      .from("tenant_settings")
      .select("industry, audience, keywords, competitors, content_style, tone, upload_frequency, config")
      .eq("tenant_id", tenantId)
      .maybeSingle<TenantSettingsRow>(),
    supabase
      .from("schedules")
      .select("days, publish_times")
      .eq("tenant_id", tenantId)
      .maybeSingle<ScheduleRow>(),
    isOwnerOrManager(tenantId),
  ]);

  const strategy = settings?.config?.strategy;
  const pillars = strategy?.pillars ?? CONTENT_PILLARS;
  const keywords = settings?.keywords ?? [];
  const competitors = settings?.competitors ?? [];
  const audience = (settings?.audience ?? {}) as Record<string, unknown>;
  const audienceEntries = Object.entries(audience).filter(([, v]) => v !== null && v !== "");

  const days = (schedule?.days ?? [1, 2, 3, 4, 5]).map((d) => DAY_NAMES[d] ?? d).join(", ");
  const times = (schedule?.publish_times ?? ["09:00"]).join(", ");

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Content Strategy"
          description="The high-level plan behind your 30-day content calendar — pillars, cadence, and audience."
        />
        <RegenerateButton canEdit={canEdit} />
      </div>

      {strategy?.note ? (
        <p className="mb-6 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs text-muted-foreground">
          {strategy.note}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Content pillars
          </h2>
          <div className="flex flex-wrap gap-2">
            {pillars.map((pillar, i) => (
              <span
                key={pillar}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground"
              >
                <span className="tabular-nums text-muted-foreground">{i + 1}</span>
                {pillar}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Cadence
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Frequency</dt>
              <dd className="font-medium capitalize text-foreground">{settings?.upload_frequency ?? "daily"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Publish days</dt>
              <dd className="font-medium text-foreground">{days}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Publish times</dt>
              <dd className="font-medium text-foreground">{times}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Target audience
          </h2>
          {audienceEntries.length === 0 && !settings?.tone ? (
            <p className="text-xs text-muted-foreground">
              No audience profile set yet — add one from onboarding or Settings.
            </p>
          ) : (
            <dl className="flex flex-col gap-3 text-sm">
              {settings?.industry ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Industry</dt>
                  <dd className="font-medium text-foreground">{settings.industry}</dd>
                </div>
              ) : null}
              {settings?.tone ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Tone</dt>
                  <dd className="font-medium capitalize text-foreground">{settings.tone}</dd>
                </div>
              ) : null}
              {audienceEntries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <dt className="capitalize text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                  <dd className="font-medium text-foreground">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="rounded-xl border border-border bg-elevated p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Tags className="h-4 w-4 text-primary" strokeWidth={1.75} />
            Keywords &amp; competitors
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Keywords</p>
              {keywords.length === 0 ? (
                <p className="text-xs text-muted-foreground">None set.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((k) => (
                    <span key={k} className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-foreground">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Swords className="h-3 w-3" strokeWidth={1.75} /> Competitors
              </p>
              {competitors.length === 0 ? (
                <p className="text-xs text-muted-foreground">None set.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {competitors.map((c) => (
                    <span key={c} className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-foreground">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
