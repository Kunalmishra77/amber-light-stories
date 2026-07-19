import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NotificationsList, type NotificationRow } from "./notifications-list";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let notifications: NotificationRow[] = [];
  let errored = false;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, read, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    notifications = data ?? [];
  } catch {
    errored = true;
  }

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
        <NotificationsList notifications={notifications} />
      )}
    </div>
  );
}
