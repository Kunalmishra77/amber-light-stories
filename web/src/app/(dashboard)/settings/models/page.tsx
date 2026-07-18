import { SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function ModelSettingsPage() {
  return (
    <div>
      <PageHeader
        title="AI Model Settings"
        description="Configure AI models used across the pipeline."
      />
      <EmptyState icon={SlidersHorizontal} />
    </div>
  );
}
