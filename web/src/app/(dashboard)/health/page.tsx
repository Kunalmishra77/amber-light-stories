import { HeartPulse } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function HealthPage() {
  return (
    <div>
      <PageHeader
        title="System Health"
        description="Service status and infrastructure health."
      />
      <EmptyState icon={HeartPulse} />
    </div>
  );
}
