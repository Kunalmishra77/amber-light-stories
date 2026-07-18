import { Sparkles, Link2, Lock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StyleForm } from "./style-form";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface StyleProfileRow {
  id: string;
  name: string | null;
  source_urls: string[] | null;
  created_at: string | null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function StylePage() {
  const admin = createAdminClient();

  let profiles: StyleProfileRow[] = [];
  let errored = false;
  try {
    const { data, error } = await admin
      .from("style_profiles")
      .select("id, name, source_urls, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    profiles = data ?? [];
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Reference Learning"
        description="Style profiles learned from reference material."
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
        <p className="text-sm text-foreground">
          Style analysis (Gemini Vision over sampled frames) runs during
          generation — a paid step, gated behind Phase 5 permission. This
          page only collects references now.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <StyleForm />

        <div>
          {errored ? (
            <EmptyState
              icon={Sparkles}
              title="Couldn't load style references"
              description="There was a problem reaching the style_profiles table. Check your Supabase connection."
            />
          ) : profiles.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No style references yet"
              description="Add a name and one or more YouTube URLs to start building a reference library."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-elevated p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </div>
                      <h2 className="text-sm font-semibold text-foreground">
                        {profile.name ?? "Untitled style"}
                      </h2>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatDate(profile.created_at)}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {(profile.source_urls ?? []).map((url) => (
                      <li key={url} className="flex items-start gap-1.5 text-xs">
                        <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="truncate text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
