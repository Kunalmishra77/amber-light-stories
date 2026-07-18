import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Writes a row to `audit_log` for a super-admin action. The table only has a
 * free-text `target` column (no target_type/target_id split), so we encode
 * `"<type>:<id>"` into `target` and keep the structured form in `meta` too.
 * Never throws — an audit-log failure should never block the action it's
 * describing, so callers fire-and-forget this.
 */
export async function writeAuditLog(opts: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  tenantId?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      user_id: opts.actorId,
      action: opts.action,
      target: `${opts.targetType}:${opts.targetId}`,
      tenant_id: opts.tenantId ?? null,
      meta: {
        target_type: opts.targetType,
        target_id: opts.targetId,
        ...opts.meta,
      },
    });
  } catch {
    // Best-effort — never fail the primary action over an audit-log write.
  }
}
