"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId, getSessionUser, isOwnerOrManager } from "@/lib/auth";
import { getAppOrigin } from "@/lib/site-url";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface InviteResult extends ActionResult {
  inviteUrl?: string;
}

function revalidate() {
  revalidatePath("/team");
}

const VALID_ROLES = new Set(["client_owner", "client_manager", "client_editor", "client_viewer"]);

/**
 * Creates an `invitations` row and returns a shareable link. There is no
 * accept-invite flow wired up yet (that lands with the auth phase that
 * builds redemption) — this generates and displays the link only; sending
 * email is optional per the spec and skipped here.
 */
export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can invite members." };
  }

  const email = ((formData.get("email") as string | null) ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };

  const role = (formData.get("role") as string | null) ?? "client_viewer";
  if (!VALID_ROLES.has(role)) return { ok: false, error: "Choose a valid role." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      tenant_id: tenantId,
      email,
      role,
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the invite." };

  const origin = await getAppOrigin();
  const inviteUrl = `${origin}/invite/${data.token}`;

  await logAudit({
    action: "team.invite_member",
    target: `invitation:${email}`,
    meta: { role },
    tenantId,
  });

  revalidate();
  return { ok: true, inviteUrl };
}

/** Revokes a pending invitation. */
export async function revokeInvite(invitationId: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can manage invites." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

/**
 * Changes a member's role. Writes via the service-role admin client because
 * `memberships` RLS (`memberships_write`) only grants write access to super
 * admins — the app-level `isOwnerOrManager` check below is what actually
 * gates this for tenant owners/managers.
 */
export async function changeMemberRole(
  membershipId: string,
  newRole: string
): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can change roles." };
  }
  if (!VALID_ROLES.has(newRole)) return { ok: false, error: "Choose a valid role." };

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("id, tenant_id, role, user_id")
    .eq("id", membershipId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "Membership not found." };

  if (membership.role === "client_owner" && newRole !== "client_owner") {
    const { count } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "client_owner")
      .eq("status", "active");
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "This workspace needs at least one owner." };
    }
  }

  const { error } = await admin
    .from("memberships")
    .update({ role: newRole })
    .eq("id", membershipId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "team.change_role",
    target: `membership:${membershipId}`,
    meta: { new_role: newRole },
    tenantId,
  });

  revalidate();
  return { ok: true };
}

/** Removes a member from the workspace. Uses the admin client for the same
 * RLS reason as changeMemberRole above. */
export async function removeMember(membershipId: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can remove members." };
  }

  const user = await getSessionUser();
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("id, tenant_id, role, user_id")
    .eq("id", membershipId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "Membership not found." };

  if (user && membership.user_id === user.id) {
    return { ok: false, error: "You can't remove yourself from the workspace." };
  }

  if (membership.role === "client_owner") {
    const { count } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "client_owner")
      .eq("status", "active");
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "This workspace needs at least one owner." };
    }
  }

  const { error } = await admin
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "team.remove_member",
    target: `membership:${membershipId}`,
    tenantId,
  });

  revalidate();
  return { ok: true };
}
