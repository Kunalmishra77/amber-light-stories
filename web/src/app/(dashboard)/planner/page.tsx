import { CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { GeneratePlanButton } from "./generate-plan-button";
import { PlannerBoard, type PlanItem } from "./planner-board";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface ContentPlanRow {
  id: string;
  month: string | null;
  status: string | null;
  strategy: { note?: string; generatedAt?: string; mock?: boolean } | null;
  created_at: string | null;
}

export default async function PlannerPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let plan: ContentPlanRow | null = null;
  let errored = false;
  try {
    const { data, error } = await supabase
      .from("content_plans")
      .select("id, month, status, strategy, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<ContentPlanRow>();
    if (error) throw error;
    plan = data;
  } catch {
    errored = true;
  }

  if (errored) {
    return (
      <div>
        <PageHeader
          title="Content Planner"
          description="Your 30-day content strategy, generated at $0."
        />
        <EmptyState
          icon={CalendarRange}
          title="Couldn't load your content plan"
          description="There was a problem reaching the content_plans table. Check your Supabase connection."
        />
      </div>
    );
  }

  if (!plan) {
    return (
      <div>
        <PageHeader
          title="Content Planner"
          description="Your 30-day content strategy, generated at $0."
        />
        <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-border bg-surface/60 px-6 py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarRange className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold text-foreground">
              No content plan yet
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Generate a 30-day starter plan built from your tenant profile —
              industry, audience, keywords and competitors. It&apos;s a free,
              deterministic mock and fully editable afterwards.
            </p>
          </div>
          <GeneratePlanButton />
          <p className="max-w-md text-xs text-muted-foreground">
            AI-researched planning runs as a paid step (enabled later); this
            is an editable starter plan.
          </p>
        </div>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("plan_items")
    .select("id, plan_id, scheduled_date, topic, angle, pillar, status, position, locked, story_id")
    .eq("plan_id", plan.id)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  const planItems = (items as PlanItem[] | null) ?? [];

  return (
    <div>
      <PageHeader
        title="Content Planner"
        description={`30-day plan for ${plan.month ?? "this month"} — ${planItems.length} items, generated at $0.`}
      />
      <PlannerBoard planId={plan.id} items={planItems} />
    </div>
  );
}
