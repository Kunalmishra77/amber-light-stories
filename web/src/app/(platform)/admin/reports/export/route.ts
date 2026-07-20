import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";
import { toCsv } from "@/lib/reports/csv";

// Reads live cross-tenant data on request — never cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Dataset = "runs" | "usage" | "tenants";
const DATASETS = new Set<Dataset>(["runs", "usage", "tenants"]);

async function buildRunsCsv(): Promise<string> {
  const supabase = await createClient();
  const [runsRes, tenantsRes] = await Promise.all([
    supabase
      .from("pipeline_runs")
      .select("id, tenant_id, story_id, status, current_stage, total_cost_usd, budget_usd, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(5000),
    supabase.from("tenants").select("id, name"),
  ]);

  const runs = (runsRes.data ?? []) as Record<string, unknown>[];
  const tenantNames = new Map(
    ((tenantsRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  const storyIds = Array.from(
    new Set(runs.map((r) => r.story_id).filter((v): v is string => Boolean(v)))
  );
  const storyTopics = new Map<string, string>();
  if (storyIds.length > 0) {
    const { data: stories } = await supabase.from("stories").select("id, topic").in("id", storyIds);
    for (const s of (stories ?? []) as { id: string; topic: string | null }[]) {
      storyTopics.set(s.id, s.topic ?? "");
    }
  }

  const headers = [
    "run_id", "tenant", "story_topic", "status", "current_stage",
    "total_cost_usd", "budget_usd", "started_at", "finished_at",
  ];
  const rows = runs.map((r) => [
    r.id,
    r.tenant_id ? tenantNames.get(r.tenant_id as string) ?? "" : "",
    r.story_id ? storyTopics.get(r.story_id as string) ?? "" : "",
    r.status,
    r.current_stage,
    r.total_cost_usd ?? 0,
    r.budget_usd ?? 0,
    r.started_at,
    r.finished_at,
  ]);
  return toCsv(headers, rows);
}

async function buildTenantsCsv(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });

  const headers = ["tenant_id", "name", "slug", "status", "created_at"];
  const rows = ((data ?? []) as Record<string, unknown>[]).map((t) => [
    t.id, t.name, t.slug, t.status, t.created_at,
  ]);
  return toCsv(headers, rows);
}

async function buildUsageCsv(): Promise<string> {
  const supabase = await createClient();
  const [tenantsRes, subsRes] = await Promise.all([
    supabase.from("tenants").select("id, name").order("name", { ascending: true }),
    supabase.from("subscriptions").select("tenant_id, plans(name)"),
  ]);

  const tenants = (tenantsRes.data ?? []) as { id: string; name: string }[];
  const planByTenant = new Map<string, string>();
  for (const s of (subsRes.data ?? []) as { tenant_id: string; plans: { name: string } | { name: string }[] | null }[]) {
    const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
    if (plan?.name && !planByTenant.has(s.tenant_id)) planByTenant.set(s.tenant_id, plan.name);
  }

  const rows: unknown[][] = [];
  for (const tenant of tenants) {
    const [storiesRes, videosRes, runsRes, usageRes] = await Promise.all([
      supabase.from("stories").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
      supabase.from("pipeline_runs").select("budget_usd").eq("tenant_id", tenant.id),
      supabase.from("api_usage").select("cost_usd").eq("tenant_id", tenant.id),
    ]);
    const budget = ((runsRes.data ?? []) as { budget_usd: number | null }[]).reduce(
      (sum, r) => sum + (r.budget_usd ?? 0), 0
    );
    const cost = ((usageRes.data ?? []) as { cost_usd: number | null }[]).reduce(
      (sum, r) => sum + (r.cost_usd ?? 0), 0
    );
    rows.push([
      tenant.name,
      planByTenant.get(tenant.id) ?? "Free",
      storiesRes.count ?? 0,
      videosRes.count ?? 0,
      budget.toFixed(2),
      cost.toFixed(2),
    ]);
  }

  const headers = ["tenant", "plan", "stories", "videos", "total_budget_usd", "total_cost_usd"];
  return toCsv(headers, rows);
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();
  } catch {
    // Match the console's non-disclosure posture for non-super-admins.
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const dataset = url.searchParams.get("dataset") as Dataset | null;
  if (!dataset || !DATASETS.has(dataset)) {
    return NextResponse.json({ error: "Unknown dataset. Use runs | usage | tenants." }, { status: 400 });
  }

  let csv: string;
  if (dataset === "runs") csv = await buildRunsCsv();
  else if (dataset === "tenants") csv = await buildTenantsCsv();
  else csv = await buildUsageCsv();

  const profile = await requireSuperAdmin();
  await writeAuditLog({
    actorId: profile.user_id,
    action: "reports.export",
    targetType: "report",
    targetId: dataset,
    meta: { dataset },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset}-export.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
