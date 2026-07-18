import { MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function PromptsPage() {
  return (
    <div>
      <PageHeader
        title="Prompts"
        description="Reusable prompt templates for generation stages."
      />
      <EmptyState icon={MessageSquareText} />
    </div>
  );
}
