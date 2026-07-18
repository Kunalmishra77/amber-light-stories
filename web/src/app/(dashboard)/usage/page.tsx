import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function UsagePage() {
  return (
    <div>
      <PageHeader
        title="API Usage & Cost"
        description="Track API spend and usage across providers."
      />
      <EmptyState icon={Wallet} />
    </div>
  );
}
