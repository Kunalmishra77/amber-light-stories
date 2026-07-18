import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  user_id: string;
  full_name: string | null;
  avatar: string | null;
  is_super_admin: boolean;
}

export interface Membership {
  tenant_id: string;
  role: string;
  status: string;
  tenant_name: string;
  tenant_slug: string | null;
}

/**
 * The signed-in user, or null. Cached per-request so every server component
 * / server action in the same render pass shares one auth round trip.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The current user's `profiles` row (includes `is_super_admin`), or null. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar, is_super_admin")
    .eq("user_id", user.id)
    .maybeSingle<Profile>();

  return data ?? null;
});

/** All active tenant memberships for the current user, with tenant name/slug. */
export const getMyMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getSessionUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("tenant_id, role, status, tenants(name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !data) return [];

  return data.map((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      tenant_id: row.tenant_id as string,
      role: row.role as string,
      status: row.status as string,
      tenant_name: (tenant as { name?: string } | null)?.name ?? "Untitled tenant",
      tenant_slug: (tenant as { slug?: string | null } | null)?.slug ?? null,
    };
  });
});

/**
 * Resolves the active tenant for this request: the `tenant_id` cookie if the
 * user is a member of it, otherwise their first active membership. Returns
 * null if the user has no active memberships at all.
 */
export const getCurrentTenantId = cache(async (): Promise<string | null> => {
  const memberships = await getMyMemberships();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const cookieTenantId = cookieStore.get("tenant_id")?.value;
  if (cookieTenantId && memberships.some((m) => m.tenant_id === cookieTenantId)) {
    return cookieTenantId;
  }

  return memberships[0].tenant_id;
});

/** The current membership row (role etc.) for the given (or active) tenant. */
export const getCurrentMembership = cache(
  async (tenantId?: string | null): Promise<Membership | null> => {
    const memberships = await getMyMemberships();
    const tid = tenantId ?? (await getCurrentTenantId());
    if (!tid) return null;
    return memberships.find((m) => m.tenant_id === tid) ?? null;
  }
);

/**
 * The set of permission keys granted to the current user's role in the given
 * (or active) tenant, via `role_permissions`. Super admins effectively have
 * every permission — check `is_super_admin` separately or use
 * `requirePermission`, which already accounts for it.
 */
export const getMyPermissions = cache(
  async (tenantId?: string | null): Promise<Set<string>> => {
    const membership = await getCurrentMembership(tenantId);
    if (!membership) return new Set();

    const supabase = await createClient();
    const { data } = await supabase
      .from("role_permissions")
      .select("permission_key")
      .eq("role_key", membership.role);

    return new Set((data ?? []).map((row) => row.permission_key as string));
  }
);

/**
 * Whether the current user may perform `permissionKey` in the given (or
 * active) tenant. Super admins always pass. Use to gate server actions and
 * conditionally render UI.
 */
export async function requirePermission(
  permissionKey: string,
  tenantId?: string | null
): Promise<boolean> {
  const profile = await getProfile();
  if (profile?.is_super_admin) return true;

  const permissions = await getMyPermissions(tenantId);
  return permissions.has(permissionKey);
}
