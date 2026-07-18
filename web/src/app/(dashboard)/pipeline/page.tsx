import { Activity } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function PipelinePage() {
  return (
    <div>
      <PageHeader
        title="Live Pipeline"
        description="Watch pipeline runs move through each stage in real time."
      />
      <EmptyState icon={Activity} />
    </div>
  );
}
