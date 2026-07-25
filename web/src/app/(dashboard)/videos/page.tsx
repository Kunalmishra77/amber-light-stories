import { Clapperboard, Download, RectangleVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Pagination, parsePage } from "@/components/pagination";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { resolveAssetUrl } from "@/lib/assets";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface RenderRow {
  id: string;
  storage_path: string | null;
  created_at: string | null;
  story_id: string | null;
}

interface VideoCard {
  id: string;
  topic: string;
  created_at: string | null;
  url: string | null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PAGE_SIZE = 24;

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";
  const page = parsePage((await searchParams).page);

  // The finished video is stored as a `render` asset in the private bucket —
  // that's what the render worker produces. This page surfaces those with a
  // playable, downloadable signed URL, which is where a client expects to find
  // their finished videos.
  let cards: VideoCard[] = [];
  let total = 0;
  let errored = false;
  try {
    const from = (page - 1) * PAGE_SIZE;
    const { data, error, count } = await supabase
      .from("assets")
      .select("id, storage_path, created_at, story_id", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("kind", "render")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as RenderRow[];
    total = count ?? rows.length;

    // Topic per video, for a human label.
    const storyIds = [...new Set(rows.map((r) => r.story_id).filter(Boolean))] as string[];
    const topics = new Map<string, string>();
    if (storyIds.length) {
      const { data: stories } = await supabase
        .from("stories")
        .select("id, topic")
        .in("id", storyIds);
      for (const s of stories ?? []) topics.set(s.id as string, (s.topic as string) ?? "");
    }

    cards = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        topic: (r.story_id ? topics.get(r.story_id) : "") || "Untitled video",
        created_at: r.created_at,
        url: await resolveAssetUrl(r.storage_path),
      }))
    );
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader title="Video Queue" description="Your finished videos — watch or download." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Finished videos" value={errored ? 0 : total} icon={Clapperboard} error={errored} />
        <StatCard label="On this page" value={errored ? 0 : cards.length} icon={RectangleVertical} error={errored} />
      </div>

      <div className="mt-8">
        {errored ? (
          <EmptyState
            icon={Clapperboard}
            title="Couldn't load videos"
            description="There was a problem reaching your videos. Try again in a moment."
          />
        ) : cards.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            title="No videos yet"
            description="Once a pipeline run finishes rendering, the video shows up here to watch and download."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-elevated shadow-sm"
                >
                  {v.url ? (
                    <video
                      src={v.url}
                      controls
                      preload="metadata"
                      className="aspect-[9/16] w-full bg-black object-contain"
                    />
                  ) : (
                    <div className="flex aspect-[9/16] w-full items-center justify-center bg-surface text-xs text-muted-foreground">
                      Preview unavailable
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p lang="hi" className="line-clamp-2 text-sm font-medium text-foreground">
                        {v.topic}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(v.created_at)}</p>
                    </div>
                    {v.url ? (
                      <a
                        href={v.url}
                        download
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-colors hover:bg-primary-hover"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={2} />
                        Download
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/videos" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
