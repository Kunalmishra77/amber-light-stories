import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function StylePage() {
  return (
    <div>
      <PageHeader
        title="Reference Learning"
        description="Style profiles learned from reference material."
      />
      <EmptyState icon={Sparkles} />
    </div>
  );
}
