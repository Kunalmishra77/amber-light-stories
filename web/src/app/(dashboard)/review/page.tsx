import { AlertTriangle, ClipboardCheck, HeartPulse, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { loadReviewQueue, resolveMemberNames, type ReviewFilter } from "@/lib/review/queue";
import { getWorkspaceHealth } from "@/lib/ops/health";
import { ReviewCenter } from "./review-center";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

const FILTERS: ReviewFilter[] = ["all", "mine", "unassigned", "overdue"];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = (FILTERS as string[]).includes(params.filter ?? "")
    ? (params.filter as ReviewFilter)
    : "all";

  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";
  const user = await getSessionUser();

  const [items, health, { data: members }] = await Promise.all([
    loadReviewQueue(supabase, tenantId, { filter, userId: user?.id ?? null }),
    getWorkspaceHealth(supabase, tenantId),
    supabase.from("memberships").select("user_id").eq("tenant_id", tenantId).eq("status", "active"),
  ]);

  const memberIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const names = await resolveMemberNames(memberIds);
  const reviewers = memberIds.map((id) => ({ id, name: names.get(id) ?? "Member" }));

  const overdue = items.filter((i) => i.overdue).length;
  const risky = items.filter(
    (i) => i.complianceStatus === "blocked" || i.qualityAction === "block" || i.qualityAction === "manual_review"
  ).length;

  return (
    <div>
      <PageHeader
        title="Review Center"
        description="Everything waiting on a human, ordered by risk and age. Approving here runs the same safety checks as the pipeline — a compliance block can never be approved away."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting review" value={items.length} icon={ClipboardCheck} />
        <StatCard label="Past due" value={overdue} icon={Timer} />
        <StatCard label="Flagged by safety checks" value={risky} icon={AlertTriangle} />
        <StatCard label="Workspace health" value={`${health.score}/100`} icon={HeartPulse} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing is waiting on you"
          description={
            filter === "all"
              ? "When a stage needs a human decision it appears here, most urgent first."
              : "No items match this filter. Try 'All'."
          }
        />
      ) : (
        <ReviewCenter
          items={items}
          reviewers={reviewers}
          currentUserId={user?.id ?? null}
          filter={filter}
        />
      )}
    </div>
  );
}
