import { Info, Route } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { GlobalRoutingForm, type ModelRoutingValue } from "./global-routing-form";

// Global default routing — reads live on every request.
export const dynamic = "force-dynamic";

const DEFAULT_ROUTING: ModelRoutingValue = {
  image: {
    High: "fal-ai/flux/dev",
    Medium: "fal-ai/flux/schnell",
    Low: "fal-ai/flux/schnell",
  },
  motion: {
    premium: "fal-ai/kling-video/v2/master/image-to-video",
    standard: "fal-ai/kling-video/v1.6/standard/image-to-video",
    cheap: "fal-ai/ltx-video-13b-distilled/image-to-video",
  },
  thumbnail: "fal-ai/flux/dev",
};

export default async function AdminRoutingPage() {
  const supabase = await createClient();

  let routing: ModelRoutingValue | null = null;
  let errored = false;

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("kind", "model_routing")
      .is("tenant_id", null)
      .maybeSingle();
    if (error) throw error;
    routing = (data?.value as ModelRoutingValue | undefined) ?? null;
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Default Model Routing"
        description="The platform-wide default model routing. Tenants inherit these defaults unless overridden."
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <p className="text-sm text-foreground">
          Tenants inherit these defaults unless overridden. A tenant with its own row in
          <span className="font-mono"> settings (kind=&apos;model_routing&apos;) </span>
          uses that instead.
        </p>
      </div>

      {errored ? (
        <EmptyState
          icon={Route}
          title="Couldn't load global routing"
          description="There was a problem reaching the settings table. Check your Supabase connection."
        />
      ) : (
        <GlobalRoutingForm value={routing ?? DEFAULT_ROUTING} />
      )}
    </div>
  );
}
