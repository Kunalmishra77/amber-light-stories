import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId, isOwnerOrManager } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { BrandForm } from "./brand-form";
import type { TenantBrandFull } from "./actions";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

const DEFAULT_BRAND: TenantBrandFull = {
  display_name: "Studio",
  tagline: null,
  accent: "#F59E0B",
  logo_url: null,
  font: "Inter",
  voice_tone: null,
};

export default async function BrandPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [{ data }, canEdit] = await Promise.all([
    supabase.from("tenant_settings").select("brand").eq("tenant_id", tenantId).maybeSingle(),
    isOwnerOrManager(tenantId),
  ]);

  const raw = (data?.brand ?? {}) as Partial<TenantBrandFull>;
  const brand: TenantBrandFull = {
    display_name: raw.display_name || DEFAULT_BRAND.display_name,
    tagline: raw.tagline ?? null,
    accent: raw.accent ?? DEFAULT_BRAND.accent,
    logo_url: raw.logo_url ?? null,
    font: raw.font ?? DEFAULT_BRAND.font,
    voice_tone: raw.voice_tone ?? null,
  };

  return (
    <div>
      <PageHeader
        title="Brand Kit"
        description="Your workspace's identity — this drives the sidebar, topbar, and branded emails clients see."
      />
      <BrandForm brand={brand} canEdit={canEdit} />
    </div>
  );
}
