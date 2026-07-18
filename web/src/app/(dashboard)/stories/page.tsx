import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function StoriesPage() {
  return (
    <div>
      <PageHeader
        title="Story Queue"
        description="Track stories moving through ideation and scripting."
      />
      <EmptyState icon={BookOpen} />
    </div>
  );
}
