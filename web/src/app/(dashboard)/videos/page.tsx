import { Clapperboard } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function VideosPage() {
  return (
    <div>
      <PageHeader
        title="Video Queue"
        description="Manage videos in production and ready to publish."
      />
      <EmptyState icon={Clapperboard} />
    </div>
  );
}
