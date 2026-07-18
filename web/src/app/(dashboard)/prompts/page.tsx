import { MessageSquareText } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface PromptRow {
  id: string;
  name: string | null;
  kind: string | null;
  template: string | null;
  version: number | string | null;
}

export default async function PromptsPage() {
  const admin = createAdminClient();

  let prompts: PromptRow[] = [];
  let errored = false;
  try {
    const { data, error } = await admin
      .from("prompts")
      .select("id, name, kind, template, version")
      .order("name", { ascending: true });
    if (error) throw error;
    prompts = data ?? [];
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Prompts"
        description="Reusable prompt templates for generation stages."
      />

      {/* Built-in story prompt — not stored in `prompts`, so it's always shown. */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareText className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              Short-form Story Prompt (v1)
            </h2>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            Built-in · Read-only
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          A single call that turns a topic into a complete short-form fable —
          logline, moral, a scene-by-scene beat sheet with narration and
          animation hints, and SEO metadata — returned as one structured JSON
          document.
        </p>
        <p className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-muted-foreground">
          &quot;You are the creative director and story engine for Amber
          Light Stories… Write ONE complete, original, cinematic short-form
          fable and return it as a SINGLE JSON document…&quot;
        </p>
        <p className="text-xs text-muted-foreground">
          Editing this prompt in the UI is a later phase — for now it&apos;s
          sourced directly from the pipeline.
        </p>
      </div>

      {errored ? (
        <EmptyState
          icon={MessageSquareText}
          title="Couldn't load prompts"
          description="There was a problem reaching the prompts table. Check your Supabase connection."
        />
      ) : prompts.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No custom prompts yet"
          description="Custom prompt templates you create will show up here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {prompt.name ?? "Untitled prompt"}
                </h3>
                {prompt.version !== null && prompt.version !== undefined ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    v{prompt.version}
                  </span>
                ) : null}
              </div>
              {prompt.kind ? (
                <span className="w-fit rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {prompt.kind}
                </span>
              ) : null}
              {prompt.template ? (
                <p className="line-clamp-3 text-xs text-muted-foreground">
                  {prompt.template}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
