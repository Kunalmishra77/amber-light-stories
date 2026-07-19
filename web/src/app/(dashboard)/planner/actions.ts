"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { notify } from "@/lib/ops/notify";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/ops/rate-limit";
import {
  CONTENT_PILLARS,
  generateMockPlanItems,
  planMonthFromItems,
  regenerateMockItem,
  type ContentPillar,
  type PlanTenantSettings,
} from "@/lib/planner/mock-plan";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface PlanItemRecord {
  id: string;
  plan_id: string;
  tenant_id: string;
  scheduled_date: string;
  topic: string | null;
  angle: string | null;
  pillar: string | null;
  status: string;
  position: number | null;
  locked: boolean | null;
}

function revalidate() {
  revalidatePath("/planner");
  revalidatePath("/");
}

async function requireContext(): Promise<
  { supabase: Supabase; tenantId: string } | { error: ActionResult }
> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return { error: { ok: false, error: "You're not a member of any workspace." } };
  }
  const supabase = await createClient();
  return { supabase, tenantId };
}

async function loadItem(
  supabase: Supabase,
  tenantId: string,
  itemId: string
): Promise<PlanItemRecord | null> {
  const { data } = await supabase
    .from("plan_items")
    .select("*")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle<PlanItemRecord>();
  return data ?? null;
}

const LOCKED_MESSAGE = "This item is locked. Unlock it first to make changes.";

/**
 * Builds a fresh 30-day MOCK content plan for the current tenant ($0, no
 * paid API calls). Reads tenant_settings for theming and the tenant's
 * schedule (if any) to decide which days of the week to place items on.
 */
export async function generateContentPlan(): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const rate = await checkRateLimit(tenantId, "content_plan_generate", 5, 60);
  if (!rate.allowed) return { ok: false, error: RATE_LIMIT_MESSAGE };

  const [{ data: settings }, { data: schedule }] = await Promise.all([
    supabase
      .from("tenant_settings")
      .select("industry, keywords, competitors, language")
      .eq("tenant_id", tenantId)
      .maybeSingle<PlanTenantSettings>(),
    supabase
      .from("schedules")
      .select("days")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ days: number[] | null }>(),
  ]);

  const drafts = generateMockPlanItems({
    tenantId,
    tenantSettings: settings ?? null,
    scheduleDays: schedule?.days ?? null,
  });

  const { data: plan, error: planError } = await supabase
    .from("content_plans")
    .insert({
      tenant_id: tenantId,
      month: planMonthFromItems(drafts),
      status: "draft",
      strategy: {
        mock: true,
        pillars: CONTENT_PILLARS,
        tenantSnapshot: settings ?? {},
        note: "AI-researched planning runs as a paid step (enabled later); this is an editable starter plan.",
        generatedAt: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (planError || !plan) {
    return { ok: false, error: planError?.message ?? "Couldn't create the plan." };
  }

  const rows = drafts.map((d) => ({ ...d, plan_id: plan.id, tenant_id: tenantId }));
  const { error: itemsError } = await supabase.from("plan_items").insert(rows);
  if (itemsError) return { ok: false, error: itemsError.message };

  await logAudit({
    action: "planner.generate_plan",
    target: `content_plan:${plan.id}`,
    meta: { itemCount: rows.length },
    tenantId,
  });

  revalidate();
  return { ok: true };
}

export async function approveItem(itemId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.locked) return { ok: false, error: LOCKED_MESSAGE };

  const { error } = await supabase
    .from("plan_items")
    .update({ status: "approved" })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "planner.approve_item",
    target: `plan_item:${itemId}`,
    tenantId,
  });

  await notify({
    tenantId,
    kind: "plan_approved",
    title: "Content plan item approved",
    body: item.topic ? `"${item.topic}" was approved for production.` : undefined,
  });

  revalidate();
  return { ok: true };
}

export async function disableItem(itemId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.locked) return { ok: false, error: LOCKED_MESSAGE };

  const { error } = await supabase
    .from("plan_items")
    .update({ status: "disabled" })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function setItemLocked(
  itemId: string,
  locked: boolean
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const { error } = await supabase
    .from("plan_items")
    .update({ locked })
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function editItem(
  itemId: string,
  fields: { topic?: string; angle?: string; scheduled_date?: string; pillar?: string }
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.locked) return { ok: false, error: LOCKED_MESSAGE };

  const topic = fields.topic?.trim();
  if (topic !== undefined && topic.length === 0) {
    return { ok: false, error: "Topic can't be empty." };
  }

  const update: Record<string, string> = {};
  if (topic) update.topic = topic;
  if (fields.angle !== undefined) update.angle = fields.angle.trim();
  if (fields.pillar !== undefined) update.pillar = fields.pillar;
  if (fields.scheduled_date !== undefined) update.scheduled_date = fields.scheduled_date;

  const { error } = await supabase
    .from("plan_items")
    .update(update)
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function moveItemDate(
  itemId: string,
  newDate: string
): Promise<ActionResult> {
  return editItem(itemId, { scheduled_date: newDate });
}

export async function duplicateItem(itemId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };

  const { data: maxRow } = await supabase
    .from("plan_items")
    .select("position")
    .eq("plan_id", item.plan_id)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number | null }>();

  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { error } = await supabase.from("plan_items").insert({
    plan_id: item.plan_id,
    tenant_id: tenantId,
    scheduled_date: item.scheduled_date,
    topic: `${item.topic ?? "Untitled"} (copy)`,
    angle: item.angle,
    pillar: item.pillar,
    status: "planned",
    locked: false,
    position: nextPosition,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.locked) return { ok: false, error: LOCKED_MESSAGE };

  const { error } = await supabase
    .from("plan_items")
    .delete()
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

/** Re-mocks a single item's topic/angle/pillar ($0) — keeps its date and position. */
export async function regenerateItem(itemId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };
  if (item.locked) return { ok: false, error: LOCKED_MESSAGE };

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("industry, keywords, competitors, language")
    .eq("tenant_id", tenantId)
    .maybeSingle<PlanTenantSettings>();

  const fresh = regenerateMockItem(
    tenantId,
    item.position ?? 0,
    item.scheduled_date,
    settings ?? null
  );

  const { error } = await supabase
    .from("plan_items")
    .update(fresh)
    .eq("id", itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function addCustomTopic(
  planId: string,
  fields: { scheduled_date: string; topic: string; angle?: string; pillar?: string }
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const topic = fields.topic.trim();
  if (!topic) return { ok: false, error: "Topic is required." };
  if (!fields.scheduled_date) return { ok: false, error: "Date is required." };

  const { data: maxRow } = await supabase
    .from("plan_items")
    .select("position")
    .eq("plan_id", planId)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number | null }>();

  const pillar: ContentPillar = (
    CONTENT_PILLARS.includes(fields.pillar as ContentPillar)
      ? fields.pillar
      : CONTENT_PILLARS[0]
  ) as ContentPillar;

  const { error } = await supabase.from("plan_items").insert({
    plan_id: planId,
    tenant_id: tenantId,
    scheduled_date: fields.scheduled_date,
    topic,
    angle: fields.angle?.trim() || "Custom addition",
    pillar,
    status: "planned",
    locked: false,
    position: (maxRow?.position ?? 0) + 1,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

/** Approves every item currently in `planned` status (skips disabled/locked). */
export async function approveAllPlanned(planId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const { error } = await supabase
    .from("plan_items")
    .update({ status: "approved" })
    .eq("plan_id", planId)
    .eq("tenant_id", tenantId)
    .eq("status", "planned")
    .eq("locked", false);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "planner.approve_all",
    target: `content_plan:${planId}`,
    tenantId,
  });

  await notify({
    tenantId,
    kind: "plan_approved",
    title: "Content plan approved",
    body: "All planned items for this plan were approved.",
  });

  revalidate();
  return { ok: true };
}

/** Swaps `position` with the adjacent item in the same plan (drag-free reorder). */
export async function moveItemPosition(
  itemId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const ctx = await requireContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;

  const item = await loadItem(supabase, tenantId, itemId);
  if (!item) return { ok: false, error: "Item not found." };

  const { data: siblings } = await supabase
    .from("plan_items")
    .select("id, position")
    .eq("plan_id", item.plan_id)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  const list = (siblings ?? []) as { id: string; position: number | null }[];
  const idx = list.findIndex((s) => s.id === itemId);
  if (idx === -1) return { ok: false, error: "Item not found in plan." };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true }; // already at the edge

  const a = list[idx];
  const b = list[swapIdx];

  const [{ error: errA }, { error: errB }] = await Promise.all([
    supabase
      .from("plan_items")
      .update({ position: b.position })
      .eq("id", a.id)
      .eq("tenant_id", tenantId),
    supabase
      .from("plan_items")
      .update({ position: a.position })
      .eq("id", b.id)
      .eq("tenant_id", tenantId),
  ]);
  if (errA || errB) return { ok: false, error: (errA ?? errB)?.message };

  revalidate();
  return { ok: true };
}
