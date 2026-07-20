"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/admin/audit";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE, getImpersonatedTenantId } from "@/lib/impersonation";

/**
 * Start an audited "View as Workspace" session for a tenant. Super-admin only
 * (re-verified here — never trust the caller). Sets the impersonation cookie,
 * writes an audit row, and drops the operator into the client shell. The
 * client shell shows an impersonation banner the whole time (see the
 * dashboard layout), and every workspace read is scoped to this tenant.
 *
 * Minimal by intent (M1). M8 will layer time-boxing + richer session records
 * on top of this same seam without changing the cookie/audit contract.
 */
export async function startImpersonation(formData: FormData) {
  const profile = await requireSuperAdmin();
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  if (!tenantId) throw new Error("A tenant id is required to view as workspace.");

  // Confirm the tenant exists before entering it (RLS grants super admins
  // cross-tenant read).
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle<{ id: string; name: string }>();
  if (!tenant) throw new Error("That workspace no longer exists.");

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  await writeAuditLog({
    actorId: profile.user_id,
    action: "impersonation.start",
    targetType: "tenant",
    targetId: tenantId,
    tenantId,
    meta: { tenant_name: tenant.name },
  });

  redirect("/");
}

/**
 * End the current "View as Workspace" session and return to the platform
 * console. Super-admin only; audited; clears the impersonation cookie.
 */
export async function stopImpersonation() {
  const profile = await requireSuperAdmin();
  const tenantId = await getImpersonatedTenantId();

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);

  if (tenantId) {
    await writeAuditLog({
      actorId: profile.user_id,
      action: "impersonation.stop",
      targetType: "tenant",
      targetId: tenantId,
      tenantId,
    });
  }

  redirect("/admin");
}
