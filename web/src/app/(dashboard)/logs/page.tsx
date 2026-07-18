import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function LogsPage() {
  return (
    <div>
      <PageHeader title="Logs" description="Search and inspect system logs." />
      <EmptyState icon={ScrollText} />
    </div>
  );
}
