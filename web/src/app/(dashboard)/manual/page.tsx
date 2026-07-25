import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ManualForm } from "./manual-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function ManualPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const { data: characters } = await supabase
    .from("characters")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Manual Content"
        description="Skip generation entirely — add a topic or full script you wrote yourself."
      />
      <div className="mx-auto max-w-xl">
        <ManualForm characters={characters ?? []} />
      </div>
    </div>
  );
}
