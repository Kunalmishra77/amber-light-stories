import { Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="General studio and account settings."
      />
      <EmptyState icon={Settings} />
    </div>
  );
}
