import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Notification categories (M15 O5). Categories exist so a member can silence a
 * class of noise without silencing everything — the usual reason people end up
 * ignoring an alerting system entirely.
 *
 * Delivery reuses the EXISTING transports: the `notifications` table for
 * in-app, `lib/email.ts` for email, and the M8 signed webhook dispatcher for
 * outbound. No second delivery system is introduced.
 */
import {
  SEVERITY_RANK,
  defaultPreference,
  type NotificationCategory,
  type NotificationSeverity,
} from "@/lib/ops/notification-categories";

export {
  NOTIFICATION_CATEGORIES,
  CATEGORY_LABELS,
  type NotificationCategory,
  type NotificationSeverity,
} from "@/lib/ops/notification-categories";

export interface NotifyOptions {
  tenantId: string;
  userId?: string | null;
  kind: string;
  title: string;
  body?: string | null;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  /** Deep link into the app, e.g. `/pipeline?run=…` — every alert is actionable. */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Collapses repeats: a second notice with the same key for the same recipient is dropped. */
  dedupeKey?: string | null;
  client?: SupabaseClient;
}

interface PreferenceRow {
  category: string;
  in_app: boolean;
  email: boolean;
  webhook: boolean;
  min_severity: string;
}

async function loadPreference(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  category: NotificationCategory
): Promise<PreferenceRow> {
  const { data } = await db
    .from("notification_preferences")
    .select("category, in_app, email, webhook, min_severity")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle<PreferenceRow>();
  return data ?? defaultPreference(category);
}

function meetsSeverity(pref: PreferenceRow, severity: NotificationSeverity): boolean {
  const min = (pref.min_severity as NotificationSeverity) ?? "info";
  return SEVERITY_RANK[severity] >= (SEVERITY_RANK[min] ?? 0);
}

/**
 * Inserts a `notifications` row. `userId` is optional — omit it for a
 * tenant-wide notification (shown to every member on /notifications and the
 * topbar bell); pass it to target a specific user.
 *
 * Preferences apply only to TARGETED notifications: a tenant-wide notice has no
 * single recipient whose preferences could be consulted.
 *
 * Never throws — a failed notification should never block the action that
 * triggered it.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  try {
    const supabase = opts.client ?? (await createClient());
    const category = opts.category ?? "general";
    const severity = opts.severity ?? "info";

    let pref: PreferenceRow | null = null;
    if (opts.userId) {
      pref = await loadPreference(supabase, opts.tenantId, opts.userId, category);
      if (!pref.in_app || !meetsSeverity(pref, severity)) return;
    }

    const { error } = await supabase.from("notifications").insert({
      tenant_id: opts.tenantId,
      user_id: opts.userId ?? null,
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? null,
      category,
      severity,
      link: opts.link ?? null,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      dedupe_key: opts.dedupeKey ?? null,
    });
    // 23505 = the dedupe key already fired. That is the intended outcome, not
    // a failure, but the fan-out below must not repeat either.
    if (error) return;

    if (opts.userId && pref) {
      await fanOut(supabase, opts, pref, severity, category);
    }
  } catch {
    // Best-effort.
  }
}

async function fanOut(
  db: SupabaseClient,
  opts: NotifyOptions,
  pref: PreferenceRow,
  severity: NotificationSeverity,
  category: NotificationCategory
): Promise<void> {
  if (pref.email && meetsSeverity(pref, severity)) {
    try {
      // The address lives in auth.users — `profiles` has no email column.
      const [{ sendMail }, { getUserEmails }] = await Promise.all([
        import("@/lib/email"),
        import("@/lib/admin/emails"),
      ]);
      const email = (await getUserEmails([opts.userId!])).get(opts.userId!);
      if (email) {
        const link = opts.link ? await absoluteUrl(opts.link) : null;
        await sendMail({
          to: email,
          subject: opts.title,
          html:
            `<p>${escapeHtml(opts.body ?? opts.title)}</p>` +
            (link ? `<p><a href="${escapeHtml(link)}">Open in Amber Light</a></p>` : ""),
        });
      }
    } catch {
      // Transport failure must never undo the in-app notification.
    }
  }

  if (pref.webhook && meetsSeverity(pref, severity)) {
    try {
      const { dispatchEvent } = await import("@/lib/webhooks/dispatch");
      await dispatchEvent({
        tenantId: opts.tenantId,
        eventType: `notification.${category}`,
        data: {
          title: opts.title,
          body: opts.body ?? null,
          severity,
          link: opts.link ?? null,
          entityType: opts.entityType ?? null,
          entityId: opts.entityId ?? null,
        },
      });
    } catch {
      // The M8 dispatcher owns its own retry/delivery-log semantics.
    }
  }
}

/**
 * Reuses the project's single origin resolver. An earlier version read
 * NEXT_PUBLIC_SITE_URL, which this project does not define — so every emailed
 * deep link was a relative path and therefore dead in an inbox.
 */
async function absoluteUrl(path: string): Promise<string> {
  if (/^https?:\/\//i.test(path)) return path;
  try {
    const { getAppOrigin } = await import("@/lib/site-url");
    const base = await getAppOrigin();
    return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  } catch {
    // Outside a request scope (a worker) there is no Host header to read.
    return path;
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
  );
}

/**
 * Notifies every active `client_owner` member of a tenant individually (so
 * each gets their own unread badge). Falls back to a single tenant-wide
 * notification (user_id null) if the tenant has no owner membership yet —
 * e.g. right after onboarding approval, before the caller has re-queried.
 */
export async function notifyTenantOwners(
  tenantId: string,
  opts: {
    kind: string;
    title: string;
    body?: string | null;
    category?: NotificationCategory;
    severity?: NotificationSeverity;
    link?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey?: string | null;
    client?: SupabaseClient;
  }
): Promise<void> {
  try {
    const supabase = opts.client ?? (await createClient());
    const { data } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "client_owner")
      .eq("status", "active");

    const owners = (data ?? []) as { user_id: string }[];

    if (owners.length === 0) {
      await notify({ ...opts, tenantId, userId: null, client: supabase });
      return;
    }

    // Routed one at a time so each owner's own preferences actually apply.
    for (const o of owners) {
      await notify({ ...opts, tenantId, userId: o.user_id, client: supabase });
    }
  } catch {
    // Best-effort.
  }
}

/** Notifies a specific set of members (assignees, mentioned users). */
export async function notifyUsers(
  tenantId: string,
  userIds: string[],
  opts: Omit<NotifyOptions, "tenantId" | "userId">
): Promise<void> {
  for (const userId of Array.from(new Set(userIds.filter(Boolean)))) {
    await notify({ ...opts, tenantId, userId });
  }
}
