import { Send, CalendarCheck, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
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
  scheduled_at: string | null;
  published_at: string | null;
  yt_video_id: string | null;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function PublishingPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let videos: VideoRow[] = [];
  let errored = false;
  try {
    const { data, error } = await supabase
      .from("videos")
      .select("id, topic, status, scheduled_at, published_at, yt_video_id")
      .eq("tenant_id", tenantId)
      .order("scheduled_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    videos = data ?? [];
  } catch {
    errored = true;
  }

  const scheduled = videos.filter((v) => v.status === "scheduled").length;
  const published = videos.filter((v) => v.status === "published" || v.status === "done" || Boolean(v.published_at)).length;

  return (
    <div>
      <PageHeader
        title="Publishing"
        description="Track every video's publish status, schedule slot, and YouTube upload state."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total videos" value={errored ? 0 : videos.length} icon={Send} error={errored} />
        <StatCard label="Scheduled" value={errored ? 0 : scheduled} icon={CalendarCheck} error={errored} />
        <StatCard label="Published" value={errored ? 0 : published} icon={CheckCircle2} error={errored} />
      </div>

      {errored ? (
        <EmptyState
          icon={Send}
          title="Couldn't load publishing data"
          description="There was a problem reaching the videos table. Check your Supabase connection."
        />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nothing to publish yet"
          description="Videos that finish rendering and get scheduled will show up here, ready to track through to YouTube."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-elevated">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Video</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Scheduled</th>
                <th className="px-5 py-3 font-medium">Published</th>
                <th className="px-5 py-3 font-medium">YouTube</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id} className="border-b border-border/60 last:border-0 hover:bg-surface/60">
                  <td lang="en" className="px-5 py-3 font-medium text-foreground">
                    {video.topic || "Untitled video"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={video.status ?? "pending"} />
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{formatDateTime(video.scheduled_at)}</td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{formatDateTime(video.published_at)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {video.yt_video_id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-approved)]/30 bg-[var(--status-approved)]/10 px-2 py-0.5 text-xs font-medium text-[var(--status-approved)]">
                        Uploaded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
                        Not uploaded
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
