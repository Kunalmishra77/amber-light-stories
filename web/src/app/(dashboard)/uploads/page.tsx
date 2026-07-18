import { UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function UploadsPage() {
  return (
    <div>
      <PageHeader
        title="Uploads"
        description="Manage uploaded reference and source files."
      />
      <EmptyState icon={UploadCloud} />
    </div>
  );
}
