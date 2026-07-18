import { LineChart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="YouTube Analytics"
        description="Performance insights for published videos."
      />
      <EmptyState icon={LineChart} />
    </div>
  );
}
