import { Bell } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Alerts and updates from your production pipeline."
      />
      <EmptyState icon={Bell} />
    </div>
  );
}
