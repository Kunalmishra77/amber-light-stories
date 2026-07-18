import type { LucideIcon } from "lucide-react";
import {
  FolderOpen,
  Image as ImageIcon,
  Film,
  Music,
  Clapperboard,
  File as FileIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { resolveAssetUrl } from "@/lib/assets";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface AssetRow {
  id: string;
  kind: string | null;
  storage_path: string | null;
  tags: string[] | null;
  created_at: string | null;
}

const IMAGE_KINDS = new Set(["reference", "keyframe", "thumbnail"]);

const KIND_ICONS: Record<string, LucideIcon> = {
  reference: ImageIcon,
  keyframe: ImageIcon,
  thumbnail: ImageIcon,
  motion: Film,
  video: Clapperboard,
  audio: Music,
};

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

export default async function AssetsPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let assets: AssetRow[] = [];
  let errored = false;
  try {
    const { data, error } = await supabase
      .from("assets")
      .select("id, kind, storage_path, tags, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    assets = data ?? [];
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Media Assets"
        description="Browse generated and uploaded media assets."
      />

      {errored ? (
        <EmptyState
          icon={FolderOpen}
          title="Couldn't load assets"
          description="There was a problem reaching the assets table. Check your Supabase connection."
        />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No assets yet"
          description="Generated and uploaded media — reference photos, keyframes, thumbnails, and more — will show up here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => {
            const kind = asset.kind ?? "asset";
            const isImage = IMAGE_KINDS.has(kind);
            const url = isImage ? resolveAssetUrl(supabase, asset.storage_path) : null;
            const Icon = KIND_ICONS[kind] ?? FileIcon;

            return (
              <div
                key={asset.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-3 shadow-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/30"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local/static asset
                    <img
                      src={url}
                      alt={kind}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {kind}
                  </span>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatDate(asset.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
