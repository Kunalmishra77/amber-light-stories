import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The tenant's project row, get-or-created.
 *
 * Every per-workspace production default — per-video budget, aspect ratio,
 * target duration, niche, the auto-approval matrix — lives on a `projects`
 * row, and a generated story links to it. But nothing ever created that row:
 * a brand-new client had zero projects, so Settings → Production showed "No
 * project row found yet" and generation couldn't read their budget or format.
 * This provisions one on demand, keyed on the already-authenticated tenant, so
 * the row exists the first time it's needed and never more than once.
 *
 * Uses the service role because it's an internal provisioning step scoped to a
 * tenant the caller already resolved from the session; the schema's column
 * defaults (language 'hi', 9:16, 45s, $1.55 cap) fill the rest.
 *
 * Returns the project id, or null if it genuinely couldn't be read or created
 * — callers already tolerate a null project (they fall back to defaults), so a
 * transient failure here degrades rather than blocks.
 */
export async function ensureTenantProject(tenantId: string): Promise<string | null> {
  if (!tenantId) return null;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await admin
    .from("projects")
    .insert({ tenant_id: tenantId })
    .select("id")
    .single();

  if (error) {
    // A parallel request may have created it between our read and write —
    // re-read rather than surface a duplicate.
    const { data: raced } = await admin
      .from("projects")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return raced?.id ?? null;
  }

  return created?.id ?? null;
}
