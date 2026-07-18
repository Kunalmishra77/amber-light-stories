import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function WorkersPage() {
  return (
    <div>
      <PageHeader
        title="Workers"
        description="Monitor background worker processes."
      />
      <EmptyState icon={Cpu} />
    </div>
  );
}
