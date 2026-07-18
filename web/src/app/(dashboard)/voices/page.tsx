import { AudioLines } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function VoicesPage() {
  return (
    <div>
      <PageHeader
        title="Voices"
        description="Manage narration voices and voice profiles."
      />
      <EmptyState icon={AudioLines} />
    </div>
  );
}
