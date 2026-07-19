import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, getSessionUser } from "@/lib/auth";

/**
 * Writes a row to `audit_log` for the CURRENT signed-in user + tenant (as
 * opposed to `src/lib/admin/audit.ts`'s `writeAuditLog`, which is used by
 * super-admin-only actions that already have an explicit actor/tenant on
 * hand). Resolves the actor and tenant from the request itself, so callers
 * in tenant-scoped server actions just pass the action + a free-text target.
 *
 * Never throws — an audit-log failure should never block the action it
 * describes, so this is always safe to fire-and-forget (though callers
 * should still `await` it to avoid an orphaned dangling promise).
 */
export async function logAudit(opts: {
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  tenantId?: string | null;
}): Promise<void> {
  try {
    const user = await getSessionUser();
    if (!user) return;

    const tenantId = opts.tenantId ?? (await getCurrentTenantId());

    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      user_id: user.id,
      tenant_id: tenantId,
      action: opts.action,
      target: opts.target ?? null,
      meta: opts.meta ?? {},
    });
  } catch {
    // Best-effort — never fail the primary action over an audit-log write.
  }
}
