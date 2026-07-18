import { Bell } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface NotificationRow {
  id: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  read: boolean | null;
  created_at: string | null;
}

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NotificationsPage() {
  const supabase = createAdminClient();

  let notifications: NotificationRow[] = [];
  let errored = false;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, read, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    notifications = data ?? [];
  } catch {
    errored = true;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Alerts and updates from your production pipeline."
      />

      {errored ? (
        <EmptyState
          icon={Bell}
          title="Couldn't load notifications"
          description="There was a problem reaching the notifications table. Check your Supabase connection."
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="Budget alerts, stage failures, and review requests will show up here."
        />
      ) : (
        <div className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Recent</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {unreadCount} unread
            </span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 px-5 py-4">
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-primary"
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-foreground">
                      {n.title ?? "Notification"}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatTimestamp(n.created_at)}
                    </span>
                  </div>
                  {n.body ? (
                    <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                  ) : null}
                  {n.kind ? (
                    <span className="mt-2 inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {n.kind}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
