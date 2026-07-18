import { Film } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function ScenesPage() {
  return (
    <div>
      <PageHeader
        title="Scene Viewer"
        description="Inspect scene-by-scene breakdowns for each story."
      />
      <EmptyState icon={Film} />
    </div>
  );
}
