import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { listStageVersions } from "@/lib/pipeline/versioning";
import { listComments } from "@/lib/collab/comments";
import { evaluateApproval } from "@/lib/approval/decision";
import type { PipelineStageRow } from "@/lib/pipeline/types";
import { ReviewDetail } from "./review-detail";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";
  const user = await getSessionUser();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("id", stageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<PipelineStageRow>();
  if (!stage) notFound();

  const [versions, comments, run] = await Promise.all([
    listStageVersions(supabase, stageId),
    listComments(supabase, { tenantId, entityType: "pipeline_stage", entityId: stageId }),
    supabase.from("pipeline_runs").select("id, story_id, status").eq("id", stage.run_id).maybeSingle<{
      id: string;
      story_id: string | null;
      status: string | null;
    }>(),
  ]);

  // A DRY-RUN of the safety layer, so the reviewer sees exactly what would
  // happen and why BEFORE deciding. Not persisted: viewing a verdict is not a
  // decision, and recording page views would bury the real decisions.
  const preview = await evaluateApproval({
    tenantId,
    runId: stage.run_id,
    stageId,
    stageName: stage.stage,
    actorId: user?.id ?? null,
    isAutomation: false,
    intent: "advance",
    persist: false,
    client: supabase as never,
  }).catch(() => null);

  const { data: story } = run.data?.story_id
    ? await supabase.from("stories").select("topic").eq("id", run.data.story_id).maybeSingle<{ topic: string | null }>()
    : { data: null };

  return (
    <div>
      <Link
        href="/review"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to Review Center
      </Link>

      <PageHeader
        title={(stage.output as { title?: string } | null)?.title ?? stage.stage.replace(/_/g, " ")}
        description={story?.topic ?? "Review this stage, compare versions, and decide."}
      />

      <ReviewDetail
        stageId={stageId}
        stage={stage.stage}
        status={stage.status}
        versions={versions}
        comments={comments}
        decision={
          preview
            ? {
                decision: preview.decision,
                allowed: preview.allowed,
                reasons: preview.reasons,
                evidence: preview.evidence as unknown as Record<string, unknown>,
                mode: preview.mode,
              }
            : null
        }
      />
    </div>
  );
}
