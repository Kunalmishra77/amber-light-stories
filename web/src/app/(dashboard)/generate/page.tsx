import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { GenerateForm } from "./generate-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data: settings }, { data: characters }] = await Promise.all([
    supabase
      .from("tenant_settings")
      .select("keywords")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ keywords: string[] | null }>(),
    supabase
      .from("characters")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
  ]);

  const hasNicheData = (settings?.keywords ?? []).length > 0;

  return (
    <div>
      <PageHeader
        title="AI Content Generator"
        description="Spin up a new draft story — topic, logline, moral, and a full scene breakdown — in one click."
      />
      <div className="mx-auto max-w-xl">
        <GenerateForm hasNicheData={hasNicheData} characters={characters ?? []} />
      </div>
    </div>
  );
}
