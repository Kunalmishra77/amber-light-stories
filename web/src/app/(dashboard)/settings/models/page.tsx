import { Info, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ModelRoutingForm, type ModelRoutingValue } from "./model-routing-form";

// Reads live rows from Supabase on every request — never prerender this.
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

export default async function ModelSettingsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let routing: ModelRoutingValue | null = null;
  let errored = false;

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("kind", "model_routing")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw error;
    routing = (data?.value as ModelRoutingValue | undefined) ?? null;
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="AI Model Settings"
        description="Configure which model handles each quality tier across the pipeline."
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <p className="text-sm text-foreground">
          Changing models here changes generation with zero code — the cost
          governor still enforces the $1.55 per-video cap no matter which
          models are routed.
        </p>
      </div>

      {errored ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Couldn't load model routing"
          description="There was a problem reaching the settings table. Check your Supabase connection."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,280px)]">
          <ModelRoutingForm value={routing ?? DEFAULT_ROUTING} />

          <div className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">
              Benchmark costs
            </h2>
            <ul className="flex flex-col gap-3 text-xs text-muted-foreground">
              <li className="flex items-start justify-between gap-3">
                <span>Kling-master (premium motion)</span>
                <span className="tabular-nums font-medium text-foreground">
                  ~$1.35 / clip
                </span>
              </li>
              <li className="flex items-start justify-between gap-3">
                <span>flux (keyframe image)</span>
                <span className="tabular-nums font-medium text-foreground">
                  ~$0.02 / image
                </span>
              </li>
              <li className="flex items-start justify-between gap-3">
                <span>LTX distilled (cheap motion)</span>
                <span className="tabular-nums font-medium text-foreground">
                  ~$0.02–0.05 / clip
                </span>
              </li>
              <li className="flex items-start justify-between gap-3">
                <span>Reused / LOW-tier scene</span>
                <span className="tabular-nums font-medium text-foreground">
                  $0
                </span>
              </li>
            </ul>
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Only HIGH-importance scenes are routed to premium motion — the
              scene decision engine keeps most videos well under budget.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
