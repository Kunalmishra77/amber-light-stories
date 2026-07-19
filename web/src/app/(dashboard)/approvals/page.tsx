import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import {
  ApprovalsBoard,
  type PlanQueueItem,
  type StageQueueItem,
  type StoryQueueItem,
} from "./approvals-board";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface StageRow {
  id: string;
  stage: string;
  run_id: string;
}

interface RunRow {
  id: string;
  story_id: string | null;
}

interface StoryRow {
  id: string;
  topic: string | null;
  logline: string | null;
  status: string | null;
}

interface PlanItemRow {
  id: string;
  topic: string | null;
  pillar: string | null;
  scheduled_date: string;
}

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: stages }, { data: planItems }, { data: draftStories }] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, stage, run_id")
      .eq("tenant_id", tenantId)
      .eq("status", "awaiting_review")
      .order("updated_at", { ascending: false }),
    supabase
      .from("plan_items")
      .select("id, topic, pillar, scheduled_date")
      .eq("tenant_id", tenantId)
      .eq("status", "planned")
      .order("scheduled_date", { ascending: true })
      .limit(30),
    supabase
      .from("stories")
      .select("id, topic, logline, status")
      .eq("tenant_id", tenantId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const stageRows = (stages as StageRow[] | null) ?? [];
  const runIds = Array.from(new Set(stageRows.map((s) => s.run_id)));

  const { data: runs } =
    runIds.length > 0
      ? await supabase.from("pipeline_runs").select("id, story_id").in("id", runIds).eq("tenant_id", tenantId)
      : { data: [] as RunRow[] };

  const runRows = (runs as RunRow[] | null) ?? [];
  const storyIdByRun = new Map(runRows.map((r) => [r.id, r.story_id] as const));
  const stageStoryIds = Array.from(new Set(runRows.map((r) => r.story_id).filter((id): id is string => !!id)));

  const { data: stageStories } =
    stageStoryIds.length > 0
      ? await supabase.from("stories").select("id, topic").in("id", stageStoryIds).eq("tenant_id", tenantId)
      : { data: [] as { id: string; topic: string | null }[] };

  const topicByStoryId = new Map((stageStories ?? []).map((s) => [s.id, s.topic] as const));

  const stageItems: StageQueueItem[] = stageRows.map((s) => {
    const storyId = storyIdByRun.get(s.run_id) ?? null;
    return {
      id: s.id,
      stage: s.stage,
      runId: s.run_id,
      storyTopic: storyId ? (topicByStoryId.get(storyId) ?? null) : null,
    };
  });

  const planQueueItems: PlanQueueItem[] = ((planItems as PlanItemRow[] | null) ?? []).map((p) => ({
    id: p.id,
    topic: p.topic,
    pillar: p.pillar,
    scheduledDate: p.scheduled_date,
  }));

  const storyQueueItems: StoryQueueItem[] = ((draftStories as StoryRow[] | null) ?? []).map((s) => ({
    id: s.id,
    topic: s.topic,
    logline: s.logline,
  }));

  const total = stageItems.length + planQueueItems.length + storyQueueItems.length;

  return (
    <div>
      <PageHeader
        title="Content Approval"
        description="Everything waiting on your review, in one queue — pipeline stages, planned topics, and draft stories."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pipeline stages" value={stageItems.length} icon={ClipboardCheck} />
        <StatCard label="Plan items" value={planQueueItems.length} icon={ClipboardCheck} />
        <StatCard label="Draft stories" value={storyQueueItems.length} icon={ClipboardCheck} />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing needs your attention"
          description="You're all caught up — new items awaiting review will show up here."
          action={{ label: "Generate content", href: "/generate" }}
        />
      ) : (
        <ApprovalsBoard stageItems={stageItems} planItems={planQueueItems} storyItems={storyQueueItems} />
      )}
    </div>
  );
}
