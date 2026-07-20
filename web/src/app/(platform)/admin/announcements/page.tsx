import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CreateAnnouncementForm } from "./create-announcement-form";
import { AnnouncementToggle } from "./announcement-toggle";

// Announcement list — reads live on every request.
export const dynamic = "force-dynamic";

interface AnnouncementRow {
  id: string;
  audience: string;
  title: string;
  body: string;
  active: boolean;
  created_at: string;
}

async function loadAnnouncements() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, audience, title, body, active, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AnnouncementRow[];
}

export default async function AdminAnnouncementsPage() {
  let announcements: AnnouncementRow[] = [];
  let errored = false;

  try {
    announcements = await loadAnnouncements();
  } catch {
    errored = true;
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Broadcast messages shown to tenants across the platform."
      />

      <div className="mb-8">
        <CreateAnnouncementForm />
      </div>

      {errored ? (
        <EmptyState
          icon={Megaphone}
          title="Couldn't load announcements"
          description="There was a problem reaching Supabase. Check the connection."
        />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Publish one above."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {announcements.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-elevated p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.audience} · {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <AnnouncementToggle id={a.id} active={a.active} />
              </div>
              <p className="text-sm text-foreground">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
