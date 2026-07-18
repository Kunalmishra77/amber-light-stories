import { LineChart, Eye, Clock3, MousePointerClick, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="YouTube Analytics"
        description="Performance insights for published videos."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Views" value="—" icon={Eye} error />
        <StatCard label="Watch time" value="—" icon={Clock3} error />
        <StatCard label="CTR" value="—" icon={MousePointerClick} error />
        <StatCard label="Subscribers" value="—" icon={Users} error />
      </div>

      <div className="mt-8">
        <EmptyState
          icon={LineChart}
          title="No analytics yet"
          description="Connect published videos to see views, CTR, retention, and subscriber growth here."
        />
      </div>
    </div>
  );
}
