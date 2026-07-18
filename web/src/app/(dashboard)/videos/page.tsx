import { Clapperboard, RectangleVertical } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface VideoRow {
  id: string;
  topic: string | null;
  status: string | null;
  aspect_ratio: string | null;
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

export default async function VideosPage() {
  const supabase = createAdminClient();

  let videos: VideoRow[] = [];
  let errored = false;
  try {
    const { data, error } = await supabase
      .from("videos")
      .select("id, topic, status, aspect_ratio, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    videos = data ?? [];
  } catch {
    errored = true;
  }

  const total = videos.length;
  const published = videos.filter(
    (v) => v.status?.toLowerCase() === "done" || v.status?.toLowerCase() === "published"
  ).length;

  return (
    <div>
      <PageHeader
        title="Video Queue"
        description="Manage videos in production and ready to publish."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Total videos"
          value={errored ? 0 : total}
          icon={Clapperboard}
          error={errored}
        />
        <StatCard
          label="Completed"
          value={errored ? 0 : published}
          icon={RectangleVertical}
          error={errored}
        />
      </div>

      <div className="mt-8">
        {errored ? (
          <EmptyState
            icon={Clapperboard}
            title="Couldn't load videos"
            description="There was a problem reaching the videos table. Check your Supabase connection."
          />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            title="No videos yet"
            description="Videos rendered by the pipeline will show up here."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-elevated">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Topic</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Aspect ratio</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr
                    key={video.id}
                    className="border-b border-border/60 last:border-0 hover:bg-surface/60"
                  >
                    <td
                      lang="hi"
                      className="px-5 py-3 font-medium text-foreground"
                    >
                      {video.topic || "Untitled video"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={video.status ?? "pending"} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {video.aspect_ratio ?? "—"}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {formatDate(video.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
