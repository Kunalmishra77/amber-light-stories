"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId, getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Uploads a reference photo for a character to Supabase Storage, records it
 * as an `assets` row, and points the character's `reference_asset_id` at it.
 * This uploaded image becomes the master reference reused for face
 * consistency across every scene & video the character appears in.
 */
export async function uploadCharacterReference(
  characterId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to upload." };
  }

  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    return { ok: false, error: "You're not a member of any workspace." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file to upload." };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files are supported." };
  }

  // RLS-scoped client for all database reads/writes.
  const supabase = await createClient();

  const { data: character, error: characterError } = await supabase
    .from("characters")
    .select("id, project_id, role")
    .eq("id", characterId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (characterError) {
    return { ok: false, error: characterError.message };
  }
  if (!character) {
    return { ok: false, error: "Character not found." };
  }

  // Service-role client is used ONLY for the storage write below — the
  // membership + tenant checks above already gate who can reach this code.
  const admin = createAdminClient();

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "Couldn't read the selected file." };
  }

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "jpg";
  const filename = `${Date.now()}.${extension || "jpg"}`;
  const path = `characters/${characterId}/${filename}`;

  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: publicUrlData } = admin.storage.from("assets").getPublicUrl(path);
  const publicUrl = publicUrlData.publicUrl;

  const { data: assetRow, error: assetError } = await supabase
    .from("assets")
    .insert({
      tenant_id: tenantId,
      project_id: character.project_id,
      character_id: characterId,
      kind: "reference",
      storage_path: publicUrl,
      tags: ["reference", character.role ?? "extra"],
    })
    .select("id")
    .single();

  if (assetError || !assetRow) {
    return {
      ok: false,
      error: assetError?.message ?? "Failed to record the uploaded asset.",
    };
  }

  const { error: updateError } = await supabase
    .from("characters")
    .update({ reference_asset_id: assetRow.id })
    .eq("id", characterId)
    .eq("tenant_id", tenantId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await logAudit({
    action: "character.upload_reference",
    target: `character:${characterId}`,
    meta: { asset_id: assetRow.id },
    tenantId,
  });

  revalidatePath("/characters");
  revalidatePath("/assets");
  return { ok: true };
}
