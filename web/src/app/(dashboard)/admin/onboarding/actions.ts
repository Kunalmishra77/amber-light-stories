"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";
import { notify } from "@/lib/ops/notify";
import type { BusinessInfo } from "@/lib/onboarding/types";

export interface ReviewActionResult {
  ok: boolean;
  error?: string;
  tempPassword?: string;
}

function generateTempPassword(): string {
  // 12 base64url chars (~72 bits) plus a fixed suffix so it always satisfies
  // typical "needs a digit + symbol" password policies.
  return `${crypto.randomBytes(9).toString("base64url")}-9!`;
}

/**
 * Approves an onboarding: creates the owner's auth user (service-role admin
 * API — this can't go through the authed/RLS client), profile + membership,
 * activates the tenant, and marks the onboarding approved. The generated
 * temp password is returned ONCE so the super admin can hand it to the
 * client — it is never persisted anywhere.
 */
export async function approveOnboardingAction(onboardingId: string): Promise<ReviewActionResult> {
  const profile = await requireSuperAdmin();
  const supabase = await createClient();

  const { data: onboarding, error: fetchError } = await supabase
    .from("onboarding")
    .select("id, tenant_id, owner_email, status, business_info")
    .eq("id", onboardingId)
    .maybeSingle();

  if (fetchError || !onboarding) return { ok: false, error: "Onboarding not found." };
  if (onboarding.status === "approved") return { ok: false, error: "Already approved." };
  if (!onboarding.owner_email) return { ok: false, error: "Onboarding has no owner email on file." };

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const businessInfo = (onboarding.business_info ?? {}) as BusinessInfo;

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: onboarding.owner_email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: businessInfo.business_name ?? null },
  });

  if (createUserError || !created?.user) {
    return { ok: false, error: createUserError?.message ?? "Couldn't create the owner account." };
  }

  const userId = created.user.id;

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: userId,
    full_name: businessInfo.business_name ?? null,
    is_super_admin: false,
  });
  if (profileError) return { ok: false, error: profileError.message };

  const { error: membershipError } = await supabase.from("memberships").insert({
    tenant_id: onboarding.tenant_id,
    user_id: userId,
    role: "client_owner",
    status: "active",
    invited_by: profile.user_id,
  });
  if (membershipError) return { ok: false, error: membershipError.message };

  const { error: tenantError } = await supabase
    .from("tenants")
    .update({ status: "active" })
    .eq("id", onboarding.tenant_id);
  if (tenantError) return { ok: false, error: tenantError.message };

  const { error: onboardingError } = await supabase
    .from("onboarding")
    .update({
      status: "approved",
      reviewed_by: profile.user_id,
      reviewed_at: new Date().toISOString(),
      notes: null,
    })
    .eq("id", onboardingId);
  if (onboardingError) return { ok: false, error: onboardingError.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action: "onboarding.approve",
    targetType: "onboarding",
    targetId: onboardingId,
    tenantId: onboarding.tenant_id,
    meta: { owner_email: onboarding.owner_email, created_user_id: userId },
  });

  await notify({
    tenantId: onboarding.tenant_id,
    userId,
    kind: "onboarding_approved",
    title: "Your workspace is approved",
    body: "Onboarding is complete — welcome to Amber Light Stories.",
  });

  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/clients");
  return { ok: true, tempPassword };
}

async function setOnboardingReviewStatus(
  onboardingId: string,
  status: "rejected" | "changes_requested",
  notes: string,
  action: string
): Promise<ReviewActionResult> {
  const profile = await requireSuperAdmin();
  const supabase = await createClient();

  const { data: onboarding, error: fetchError } = await supabase
    .from("onboarding")
    .select("id, tenant_id")
    .eq("id", onboardingId)
    .maybeSingle();
  if (fetchError || !onboarding) return { ok: false, error: "Onboarding not found." };

  const { error } = await supabase
    .from("onboarding")
    .update({
      status,
      notes: notes.trim() || null,
      reviewed_by: profile.user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", onboardingId);
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    actorId: profile.user_id,
    action,
    targetType: "onboarding",
    targetId: onboardingId,
    tenantId: onboarding.tenant_id,
    meta: { notes },
  });

  revalidatePath("/admin/onboarding");
  return { ok: true };
}

export async function rejectOnboardingAction(onboardingId: string, notes: string): Promise<ReviewActionResult> {
  return setOnboardingReviewStatus(onboardingId, "rejected", notes, "onboarding.reject");
}

export async function requestChangesOnboardingAction(
  onboardingId: string,
  notes: string
): Promise<ReviewActionResult> {
  return setOnboardingReviewStatus(onboardingId, "changes_requested", notes, "onboarding.request_changes");
}
