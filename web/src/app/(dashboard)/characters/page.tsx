import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth";
import { resolveAssetUrl } from "@/lib/assets";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CharacterCard, type CharacterCardData } from "./character-card";

// Reads live rows from Supabase on every request — never prerender this.
export const dynamic = "force-dynamic";

interface CharacterRow extends CharacterCardData {
  reference_asset_id: string | null;
}

interface AssetRow {
  id: string;
  storage_path: string | null;
}

const ROLE_ORDER: Record<string, number> = { primary: 0, secondary: 1, extra: 2 };

export default async function CharactersPage() {
  const supabase = await createClient();
  const tenantId = (await getCurrentTenantId()) ?? "";

  let characters: CharacterRow[] = [];
  let errored = false;
  try {
    const { data, error } = await supabase
      .from("characters")
      .select(
        "id, name, role, source, ethnicity, gender, reference_asset_id"
      )
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    if (error) throw error;
    characters = (data ?? []).slice().sort((a, b) => {
      const ra = ROLE_ORDER[a.role ?? "extra"] ?? 3;
      const rb = ROLE_ORDER[b.role ?? "extra"] ?? 3;
      return ra - rb;
    });
  } catch {
    errored = true;
  }

  const referenceIds = characters
    .map((c) => c.reference_asset_id)
    .filter((id): id is string => Boolean(id));

  const imageUrlByCharacter = new Map<string, string>();
  if (referenceIds.length > 0) {
    const { data: assets } = await supabase
      .from("assets")
      .select("id, storage_path")
      .eq("tenant_id", tenantId)
      .in("id", referenceIds);

    const assetById = new Map<string, AssetRow>(
      ((assets ?? []) as AssetRow[]).map((a) => [a.id, a])
    );

    for (const character of characters) {
      if (!character.reference_asset_id) continue;
      const asset = assetById.get(character.reference_asset_id);
      const url = resolveAssetUrl(supabase, asset?.storage_path);
      if (url) imageUrlByCharacter.set(character.id, url);
    }
  }

  return (
    <div>
      <PageHeader
        title="Characters"
        description="Browse and manage your character library."
      />

      {errored ? (
        <EmptyState
          icon={Users}
          title="Couldn't load characters"
          description="There was a problem reaching the characters table. Check your Supabase connection."
        />
      ) : characters.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No characters yet"
          description="Characters used across stories & scenes will show up here."
          action={{ label: "Generate your first story", href: "/generate" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              imageUrl={imageUrlByCharacter.get(character.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
