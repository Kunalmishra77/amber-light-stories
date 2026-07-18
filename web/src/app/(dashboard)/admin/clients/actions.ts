"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
  tenantId?: string;
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

  await writeAuditLog({
    actorId: profile.user_id,
    action: "client.create",
    targetType: "tenant",
    targetId: tenant.id as string,
    tenantId: tenant.id as string,
    meta: { name, slug },
  });

  revalidatePath("/admin/clients");
  return { ok: true, tenantId: tenant.id as string };
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
