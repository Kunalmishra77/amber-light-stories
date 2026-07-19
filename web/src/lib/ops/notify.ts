import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface NotifyOptions {
  tenantId: string;
  userId?: string | null;
  kind: string;
  title: string;
  body?: string | null;
}

/**
 * Inserts a `notifications` row. `userId` is optional — omit it for a
 * tenant-wide notification (shown to every member on /notifications and the
 * topbar bell); pass it to target a specific user.
 *
 * Never throws — a failed notification should never block the action that
 * triggered it.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("notifications").insert({
      tenant_id: opts.tenantId,
      user_id: opts.userId ?? null,
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? null,
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Notifies every active `client_owner` member of a tenant individually (so
 * each gets their own unread badge). Falls back to a single tenant-wide
 * notification (user_id null) if the tenant has no owner membership yet —
 * e.g. right after onboarding approval, before the caller has re-queried.
 */
export async function notifyTenantOwners(
  tenantId: string,
  opts: { kind: string; title: string; body?: string | null }
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "client_owner")
      .eq("status", "active");

    const owners = (data ?? []) as { user_id: string }[];

    if (owners.length === 0) {
      await notify({ tenantId, kind: opts.kind, title: opts.title, body: opts.body });
      return;
    }

    await supabase.from("notifications").insert(
      owners.map((o) => ({
        tenant_id: tenantId,
        user_id: o.user_id,
        kind: opts.kind,
        title: opts.title,
        body: opts.body ?? null,
      }))
    );
  } catch {
    // Best-effort.
  }
}
