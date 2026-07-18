import { AudioLines } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface VoiceRow {
  id: string;
  name: string | null;
  provider: string | null;
  voice_id: string | null;
  language: string | null;
}

export default async function VoicesPage() {
  const admin = createAdminClient();

  let voices: VoiceRow[] = [];
  let errored = false;
  try {
    const { data, error } = await admin
      .from("voices")
      .select("id, name, provider, voice_id, language")
      .order("name", { ascending: true });
    if (error) throw error;
    voices = data ?? [];
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Voices"
        description="Manage narration voices and voice profiles."
      />

      {errored ? (
        <EmptyState
          icon={AudioLines}
          title="Couldn't load voices"
          description="There was a problem reaching the voices table. Check your Supabase connection."
        />
      ) : voices.length === 0 ? (
        <EmptyState
          icon={AudioLines}
          title="No voices yet"
          description="Narration voices configured for this project will show up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {voices.map((voice) => {
              const isPrimary = (voice.name ?? "")
                .toLowerCase()
                .includes("primary");
              const isSecondary = (voice.name ?? "")
                .toLowerCase()
                .includes("secondary");

              return (
                <div
                  key={voice.id}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-elevated p-5 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <AudioLines className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-foreground">
                          {voice.name ?? "Untitled voice"}
                        </h2>
                        {isPrimary || isSecondary ? (
                          <span
                            className={cn(
                              "text-[10px] font-medium uppercase tracking-wide",
                              isPrimary ? "text-primary" : "text-blue-400"
                            )}
                          >
                            {isPrimary ? "Primary" : "Secondary"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {voice.provider ? (
                      <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {voice.provider}
                      </span>
                    ) : null}
                  </div>

                  <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Voice ID</dt>
                      <dd className="truncate font-mono text-foreground">
                        {voice.voice_id ?? "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Language</dt>
                      <dd className="font-medium uppercase text-foreground">
                        {voice.language ?? "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Voice preview plays at generation time (ElevenLabs).
          </p>
        </>
      )}
    </div>
  );
}
