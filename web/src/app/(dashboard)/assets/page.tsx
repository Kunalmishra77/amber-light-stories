import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function AssetsPage() {
  return (
    <div>
      <PageHeader
        title="Media Assets"
        description="Browse generated and uploaded media assets."
      />
      <EmptyState icon={FolderOpen} />
    </div>
  );
}
