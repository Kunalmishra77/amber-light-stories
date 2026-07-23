import "server-only";
import { getCurrentTenantId, getSessionUser, requirePermission } from "@/lib/auth";

/**
 * Permission gate for server actions (Priority 2).
 *
 * The audit found `requirePermission` / `getMyPermissions` had ZERO call sites:
 * the seeded `role_permissions` matrix was decorative, and every tenant action
 * gated on membership alone, so a `client_viewer` could approve content, spend
 * AI budget and delete plan items.
 *
 * This wraps the existing helpers — it does not introduce a second
 * authorization system. Super admins pass by way of `requirePermission`.
 */
export const PERMISSIONS = {
  workspaceView: "workspace.view",
  contentView: "content.view",
  contentCreate: "content.create",
  contentEdit: "content.edit",
  contentApprove: "content.approve",
  contentDelete: "content.delete",
  channelsManage: "channels.manage",
  credentialsManage: "credentials.manage",
  scheduleManage: "schedule.manage",
  settingsManage: "settings.manage",
  membersManage: "members.manage",
  billingManage: "billing.manage",
  usageView: "usage.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Human-readable refusals — a generic "forbidden" teaches the user nothing. */
const DENIAL: Record<string, string> = {
  "content.approve": "You don't have permission to approve or reject content.",
  "content.create": "You don't have permission to create content.",
  "content.edit": "You don't have permission to edit content.",
  "content.delete": "You don't have permission to delete content.",
  "channels.manage": "You don't have permission to manage channels.",
  "credentials.manage": "You don't have permission to manage credentials or API keys.",
  "schedule.manage": "You don't have permission to change automation or the schedule.",
  "settings.manage": "You don't have permission to change workspace settings.",
  "members.manage": "You don't have permission to manage members.",
  "billing.manage": "You don't have permission to manage billing.",
};

export interface AuthorizedContext {
  tenantId: string;
  userId: string | null;
}

export type AuthzResult<T> = { ok: true; ctx: AuthorizedContext } | { ok: false; error: string } | T;

/**
 * Resolves the active tenant AND checks a permission in one step.
 * Returns either the authorized context or a ready-made error result.
 */
export async function authorize(
  permission: PermissionKey
): Promise<{ ok: true; tenantId: string; userId: string | null } | { ok: false; error: string }> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  if (!(await requirePermission(permission, tenantId))) {
    return { ok: false, error: DENIAL[permission] ?? "You don't have permission to do that." };
  }

  const user = await getSessionUser();
  return { ok: true, tenantId, userId: user?.id ?? null };
}

/**
 * Permission check for a tenant already resolved by the caller. Returns an
 * error message, or null when allowed.
 */
export async function denyUnless(
  permission: PermissionKey,
  tenantId: string
): Promise<string | null> {
  if (await requirePermission(permission, tenantId)) return null;
  return DENIAL[permission] ?? "You don't have permission to do that.";
}
