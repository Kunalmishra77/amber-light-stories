import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * "View as Workspace" (impersonation) context.
 *
 * Platform operators (super admins) hold NO tenant membership by design
 * (Bible Part 2 / ADR-002). To operate inside a client workspace they start
 * an explicit, audited impersonation, which sets this cookie. `auth.ts`
 * honours it ONLY for super admins, so a non-super-admin setting this cookie
 * by hand gains nothing (RLS + membership checks still apply to them).
 *
 * This is the MINIMAL M1 capability. The richer Enterprise Impersonation
 * Console (time-boxing, full session records, live "acting as" audit views)
 * is M8 — it will build on this module without refactoring it: the cookie +
 * audited start/stop + `is-impersonating` signal are the stable seam.
 */
export const IMPERSONATION_COOKIE = "impersonate_tenant";

/** The tenant id the operator is currently viewing-as, or null. Pure cookie
 * read — no auth dependency (keeps auth.ts ↔ impersonation.ts acyclic). The
 * caller is responsible for only honouring this for super admins. */
export const getImpersonatedTenantId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATION_COOKIE)?.value ?? null;
});

export interface ImpersonatedTenant {
  id: string;
  name: string;
}

/**
 * The impersonated tenant's id + display name, or null if not impersonating.
 * Resolves the name even though the operator is NOT a member (RLS grants
 * super admins cross-tenant read). Best-effort — falls back to the id.
 */
export const getImpersonatedTenant = cache(
  async (): Promise<ImpersonatedTenant | null> => {
    const id = await getImpersonatedTenantId();
    if (!id) return null;
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", id)
        .maybeSingle<{ name: string }>();
      return { id, name: data?.name ?? "Client workspace" };
    } catch {
      return { id, name: "Client workspace" };
    }
  }
);
