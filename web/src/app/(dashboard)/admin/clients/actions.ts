"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
  tenantId?: string;
  onboardingToken?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "client"
  );
}

function required(formData: FormData, key: string): string | null {
  const raw = (formData.get(key) as string | null) ?? "";
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Creates a new tenant (status='pending') plus its default tenant_settings
 * row. Super-admin-only — verified server-side regardless of who can reach
 * the form.
 */
export async function createClientAction(formData: FormData): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const name = required(formData, "name");
  if (!name) return { ok: false, error: "Client name is required." };

  const ownerEmail = required(formData, "owner_email");
  if (!ownerEmail || !isValidEmail(ownerEmail)) {
    return { ok: false, error: "A valid owner email is required to generate the onboarding link." };
  }

  const country = (formData.get("country") as string | null)?.trim() || null;
  const timezone = (formData.get("timezone") as string | null)?.trim() || "UTC";
  const language = (formData.get("language") as string | null)?.trim() || "en";
  const industry = (formData.get("industry") as string | null)?.trim() || null;

  const supabase = await createClient();

  const baseSlug = slugify(name);
  let slug = baseSlug;
  for (let i = 0; i < 20; i++) {
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name,
      slug,
      status: "pending",
      created_by: profile.user_id,
    })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    return { ok: false, error: tenantError?.message ?? "Couldn't create client." };
  }

  const { error: settingsError } = await supabase.from("tenant_settings").insert({
    tenant_id: tenant.id,
    country,
    timezone,
    language,
    industry,
  });

  if (settingsError) {
    return { ok: false, error: settingsError.message };
  }

  // Every new tenant gets an onboarding row up front (status='created') so
  // there's always a link to hand the client — the wizard itself is
  // token-gated and unauthenticated (src/app/onboarding/[token]).
  const { data: onboarding, error: onboardingError } = await supabase
    .from("onboarding")
    .insert({ tenant_id: tenant.id, owner_email: ownerEmail, status: "created" })
    .select("link_token")
    .single();

  if (onboardingError || !onboarding) {
    return {
      ok: false,
      error: `Client created, but couldn't generate the onboarding link: ${onboardingError?.message ?? "unknown error"}.`,
    };
  }

  await writeAuditLog({
    actorId: profile.user_id,
    action: "client.create",
    targetType: "tenant",
    targetId: tenant.id as string,
    tenantId: tenant.id as string,
    meta: { name, slug, owner_email: ownerEmail },
  });

  revalidatePath("/admin/clients");
  return { ok: true, tenantId: tenant.id as string, onboardingToken: onboarding.link_token as string };
}

const VALID_STATUSES = new Set(["pending", "active", "suspended", "locked", "deleted"]);

async function setTenantStatus(
  tenantId: string,
  status: string,
  action: string
): Promise<ActionResult> {
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const profile = await requireSuperAdmin();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "deleted") {
    patch.deleted_at = new Date().toISOString();
  } else {
    patch.deleted_at = null;
  }

  const { error } = await supabase.from("tenants").update(patch).eq("id", tenantId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action,
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    meta: { status },
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${tenantId}`);
  return { ok: true, tenantId };
}

export async function suspendTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatus(tenantId, "suspended", "client.suspend");
}

export async function activateTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatus(tenantId, "active", "client.activate");
}

export async function lockTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatus(tenantId, "locked", "client.lock");
}

export async function unlockTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatus(tenantId, "active", "client.unlock");
}

export async function deleteTenantAction(tenantId: string): Promise<ActionResult> {
  return setTenantStatus(tenantId, "deleted", "client.delete");
}

/** Updates the tenant_settings row from the client-detail page. */
export async function updateTenantSettingsAction(
  tenantId: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const budgetRaw = (formData.get("per_video_budget_usd") as string | null) ?? "";
  const budget = Number(budgetRaw);
  if (!Number.isFinite(budget) || budget <= 0) {
    return { ok: false, error: "Budget must be a positive number." };
  }

  const country = (formData.get("country") as string | null)?.trim() || null;
  const timezone = (formData.get("timezone") as string | null)?.trim() || "UTC";
  const language = (formData.get("language") as string | null)?.trim() || "en";
  const industry = (formData.get("industry") as string | null)?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_settings")
    .update({
      country,
      timezone,
      language,
      industry,
      per_video_budget_usd: budget,
    })
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "client.settings_update",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
  });

  revalidatePath(`/admin/clients/${tenantId}`);
  return { ok: true, tenantId };
}

/**
 * Assigns a plan to a tenant: updates its most recent subscription row if
 * one exists, otherwise creates a new active subscription. Stripe-ready —
 * `stripe_ref` stays null until real billing is wired up.
 */
export async function assignPlanAction(tenantId: string, planId: string): Promise<ActionResult> {
  const profile = await requireSuperAdmin();
  if (!planId) return { ok: false, error: "Choose a plan." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ plan_id: planId, status: "active" })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("subscriptions")
      .insert({ tenant_id: tenantId, plan_id: planId, status: "active" });
    if (error) return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actorId: profile.user_id,
    action: "client.assign_plan",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    meta: { plan_id: planId },
  });

  revalidatePath(`/admin/clients/${tenantId}`);
  revalidatePath("/billing");
  return { ok: true, tenantId };
}

/**
 * Appends a `credit_ledger` entry for a tenant (positive delta = grant,
 * negative = deduction), recomputing `balance_after` from the tenant's most
 * recent ledger entry.
 */
export async function addCreditsAction(
  tenantId: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireSuperAdmin();

  const deltaRaw = (formData.get("delta") as string | null) ?? "";
  const delta = Number(deltaRaw);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "Enter a non-zero credit amount." };
  }

  const reason = ((formData.get("reason") as string | null) ?? "").trim() || "Manual adjustment";

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("credit_ledger")
    .select("balance_after")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ balance_after: number | null }>();

  const balanceAfter = (last?.balance_after ?? 0) + delta;

  const { error } = await supabase.from("credit_ledger").insert({
    tenant_id: tenantId,
    delta,
    balance_after: balanceAfter,
    reason,
    ref: `admin:${profile.user_id}`,
  });
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "client.add_credits",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    meta: { delta, balance_after: balanceAfter, reason },
  });

  revalidatePath(`/admin/clients/${tenantId}`);
  revalidatePath("/billing");
  return { ok: true, tenantId };
}
