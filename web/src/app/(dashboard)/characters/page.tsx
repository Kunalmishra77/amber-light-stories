import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function CharactersPage() {
  return (
    <div>
      <PageHeader
        title="Characters"
        description="Browse and manage your character library."
      />
      <EmptyState icon={Users} />
    </div>
  );
}
