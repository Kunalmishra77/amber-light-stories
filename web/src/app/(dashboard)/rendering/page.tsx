import { Layers } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function RenderingPage() {
  return (
    <div>
      <PageHeader
        title="Rendering Queue"
        description="Monitor render jobs and output status."
      />
      <EmptyState icon={Layers} />
    </div>
  );
}
