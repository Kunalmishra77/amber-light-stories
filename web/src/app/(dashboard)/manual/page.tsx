import { PageHeader } from "@/components/page-header";
import { ManualForm } from "./manual-form";

export default function ManualPage() {
  return (
    <div>
      <PageHeader
        title="Manual Content"
        description="Skip generation entirely — add a topic or full script you wrote yourself."
      />
      <div className="mx-auto max-w-xl">
        <ManualForm />
      </div>
    </div>
  );
}
