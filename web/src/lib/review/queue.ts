import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The human review queue (M15 O3).
 *
 * There is NO separate queue table: the queue IS `pipeline_stages` with
 * status = 'awaiting_review'. A second table would let a stage be "in the
 * queue" and "not awaiting review" at the same time, which is exactly the class
 * of bug an operations tool must not have.
 */
export interface ReviewItem {
  id: string;
  run_id: string;
  stage: string;
  seq: number;
  status: string;
  output: Record<string, unknown> | null;
  review_priority: number;
  assigned_to: string | null;
  assigned_at: string | null;
  review_due_at: string | null;
  review_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewItemEnriched extends ReviewItem {
  topic: string | null;
  runStatus: string | null;
  assigneeName: string | null;
  /** Hours the item has been waiting. */
  waitingHours: number;
  overdue: boolean;
  /** Safety signals for the run, so a reviewer sees risk before opening it. */
  qualityAction: string | null;
  complianceStatus: string | null;
}

export type ReviewFilter = "all" | "mine" | "unassigned" | "overdue";

const DEFAULT_DUE_HOURS = 24;

/** Priority is derived, not guessed: risk and age move an item up the queue. */
export function derivePriority(input: {
  complianceStatus: string | null;
  qualityAction: string | null;
  waitingHours: number;
  stage: string;
}): number {
  let p = 50;
  if (input.complianceStatus === "blocked") p -= 30;
  else if (input.complianceStatus === "manual_review") p -= 15;
  if (input.qualityAction === "manual_review" || input.qualityAction === "block") p -= 10;
  if (input.stage === "publish") p -= 10;
  if (input.waitingHours > 48) p -= 15;
  else if (input.waitingHours > 24) p -= 8;
  return Math.max(0, Math.min(100, p));
}

export async function loadReviewQueue(
  db: SupabaseClient,
  tenantId: string,
  opts: { filter?: ReviewFilter; userId?: string | null; limit?: number } = {}
): Promise<ReviewItemEnriched[]> {
  const { data } = await db
    .from("pipeline_stages")
    .select(
      "id, run_id, stage, seq, status, output, review_priority, assigned_to, assigned_at, review_due_at, review_started_at, created_at, updated_at"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "awaiting_review")
    .order("review_priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 100);

  const items = (data ?? []) as ReviewItem[];
  if (items.length === 0) return [];

  const runIds = Array.from(new Set(items.map((i) => i.run_id)));
  const assigneeIds = Array.from(new Set(items.map((i) => i.assigned_to).filter((v): v is string => !!v)));

  const [runsRes, qualityRes, complianceRes, profilesRes] = await Promise.all([
    db.from("pipeline_runs").select("id, story_id, status").in("id", runIds).eq("tenant_id", tenantId),
    db.from("quality_scores").select("run_id, action, created_at").in("run_id", runIds).eq("tenant_id", tenantId),
    db.from("compliance_checks").select("run_id, status, created_at").in("run_id", runIds).eq("tenant_id", tenantId),
    assigneeIds.length
      ? db.from("profiles").select("id, full_name, email").in("id", assigneeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const runs = (runsRes.data ?? []) as { id: string; story_id: string | null; status: string | null }[];
  const storyIds = runs.map((r) => r.story_id).filter((v): v is string => !!v);
  const { data: stories } = storyIds.length
    ? await db.from("stories").select("id, topic").in("id", storyIds).eq("tenant_id", tenantId)
    : { data: [] };

  const topicById = new Map(((stories ?? []) as { id: string; topic: string | null }[]).map((s) => [s.id, s.topic]));
  const runById = new Map(runs.map((r) => [r.id, r]));
  const nameById = new Map(
    ((profilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      p.full_name || p.email || "Unknown",
    ])
  );

  // Latest verdict per run.
  const latest = <T extends { run_id: string; created_at: string }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) {
      const prev = m.get(r.run_id);
      if (!prev || r.created_at > prev.created_at) m.set(r.run_id, r);
    }
    return m;
  };
  const qualityByRun = latest((qualityRes.data ?? []) as { run_id: string; action: string; created_at: string }[]);
  const complianceByRun = latest((complianceRes.data ?? []) as { run_id: string; status: string; created_at: string }[]);

  const now = Date.now();
  const enriched = items.map((item) => {
    const run = runById.get(item.run_id);
    const waitingHours = (now - new Date(item.created_at).getTime()) / 3_600_000;
    const dueAt = item.review_due_at
      ? new Date(item.review_due_at).getTime()
      : new Date(item.created_at).getTime() + DEFAULT_DUE_HOURS * 3_600_000;
    return {
      ...item,
      topic: run?.story_id ? topicById.get(run.story_id) ?? null : null,
      runStatus: run?.status ?? null,
      assigneeName: item.assigned_to ? nameById.get(item.assigned_to) ?? null : null,
      waitingHours,
      overdue: now > dueAt,
      qualityAction: qualityByRun.get(item.run_id)?.action ?? null,
      complianceStatus: complianceByRun.get(item.run_id)?.status ?? null,
    };
  });

  const filtered = enriched.filter((i) => {
    switch (opts.filter ?? "all") {
      case "mine":
        return i.assigned_to === opts.userId;
      case "unassigned":
        return !i.assigned_to;
      case "overdue":
        return i.overdue;
      default:
        return true;
    }
  });

  // Derived priority orders the view; the stored column only ever holds an
  // explicit human override.
  return filtered.sort((a, b) => {
    const pa = a.review_priority !== 50 ? a.review_priority : derivePriority(a);
    const pb = b.review_priority !== 50 ? b.review_priority : derivePriority(b);
    return pa - pb || a.created_at.localeCompare(b.created_at);
  });
}
