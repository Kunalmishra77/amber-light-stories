import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { GenerateForm } from "./generate-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("keywords")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ keywords: string[] | null }>();

  const hasNicheData = (settings?.keywords ?? []).length > 0;

  return (
    <div>
      <PageHeader
        title="AI Content Generator"
        description="Spin up a new draft story — topic, logline, moral, and a full scene breakdown — in one click."
      />
      <div className="mx-auto max-w-xl">
        <GenerateForm hasNicheData={hasNicheData} />
      </div>
    </div>
  );
}
