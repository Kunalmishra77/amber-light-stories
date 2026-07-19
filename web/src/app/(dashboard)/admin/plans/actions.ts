"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

function parseJsonObject(raw: string | null, fieldLabel: string): JsonObjectResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: `${fieldLabel} must be a JSON object, e.g. {"videos_month": 60}.` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: `${fieldLabel} is not valid JSON.` };
  }
}

/** Updates a plan's name/price/limits/features/active/sort. Super-admin-only. */
export async function updatePlanAction(planId: string, formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) return { ok: false, error: "Plan name is required." };

  const priceRaw = (formData.get("price_month") as string | null) ?? "0";
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Price must be a non-negative number." };
  }

  const sortRaw = (formData.get("sort") as string | null) ?? "0";
  const sort = Number(sortRaw);
  if (!Number.isInteger(sort)) {
    return { ok: false, error: "Sort order must be a whole number." };
  }

  const limitsResult = parseJsonObject(formData.get("limits") as string | null, "Limits");
  if (!limitsResult.ok) return { ok: false, error: limitsResult.error };

  const featuresResult = parseJsonObject(formData.get("features") as string | null, "Features");
  if (!featuresResult.ok) return { ok: false, error: featuresResult.error };

  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    .update({
      name,
      price_month: price,
      limits: limitsResult.value,
      features: featuresResult.value,
      active,
      sort,
    })
    .eq("id", planId);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "plan.update",
    targetType: "plan",
    targetId: planId,
    meta: { name, price_month: price, active, sort },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/billing");
  return { ok: true };
}
