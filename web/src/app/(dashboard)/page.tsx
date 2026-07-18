import {
  FolderKanban,
  Users,
  AudioLines,
  Clapperboard,
  BookOpen,
  Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";

// This dashboard reads live counts straight from Supabase on every request,
// so it must never be statically prerendered / cached at build time.
export const dynamic = "force-dynamic";

interface CharacterRow {
  id: string;
  name: string | null;
  role: string | null;
  gender: string | null;
}

interface VoiceRow {
  id: string;
  name: string | null;
  language: string | null;
}

async function getCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  tenantId: string
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) return null;
  return count ?? 0;
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  const [projects, characters, voices, videos, stories, pipelineRuns] =
    await Promise.all([
      getCount(supabase, "projects", tenantId),
      getCount(supabase, "characters", tenantId),
      getCount(supabase, "voices", tenantId),
      getCount(supabase, "videos", tenantId),
      getCount(supabase, "stories", tenantId),
      getCount(supabase, "pipeline_runs", tenantId),
    ]);

  let recentCharacters: CharacterRow[] = [];
  let charactersErrored = false;
  try {
    const { data, error } = await supabase
      .from("characters")
      .select("id, name, role, gender")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    recentCharacters = data ?? [];
  } catch {
    charactersErrored = true;
  }

  let voiceRows: VoiceRow[] = [];
  let voicesErrored = false;
  try {
    const { data, error } = await supabase
      .from("voices")
      .select("id, name, language")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    voiceRows = data ?? [];
  } catch {
    voicesErrored = true;
  }

  const stats = [
    { label: "Projects", value: projects, icon: FolderKanban },
    { label: "Characters", value: characters, icon: Users },
    { label: "Voices", value: voices, icon: AudioLines },
    { label: "Videos", value: videos, icon: Clapperboard },
    { label: "Stories", value: stories, icon: BookOpen },
    { label: "Pipeline runs", value: pipelineRuns, icon: Activity },
  ];

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Live counts from your Amber Light Stories production database."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value ?? 0}
            icon={stat.icon}
            error={stat.value === null}
          />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent characters */}
        <div className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              Recent characters
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {recentCharacters.length} shown
            </span>
          </div>

          {charactersErrored || recentCharacters.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Users}
                title={
                  charactersErrored
                    ? "Couldn't load characters"
                    : "No characters yet"
                }
                description={
                  charactersErrored
                    ? "There was a problem reaching the characters table. Check your Supabase connection."
                    : "Characters you create will show up here."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Gender</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCharacters.map((character) => (
                    <tr
                      key={character.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-5 py-3 font-medium text-foreground">
                        {character.name ?? "Untitled"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {character.role ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {character.gender ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Voice library */}
        <div className="rounded-xl border border-border bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              Voice library
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {voiceRows.length} shown
            </span>
          </div>

          {voicesErrored || voiceRows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={AudioLines}
                title={voicesErrored ? "Couldn't load voices" : "No voices yet"}
                description={
                  voicesErrored
                    ? "There was a problem reaching the voices table. Check your Supabase connection."
                    : "Narration voices you add will show up here."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Language</th>
                  </tr>
                </thead>
                <tbody>
                  {voiceRows.map((voice) => (
                    <tr
                      key={voice.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-5 py-3 font-medium text-foreground">
                        {voice.name ?? "Untitled"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {voice.language ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
