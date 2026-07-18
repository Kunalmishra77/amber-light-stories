"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file to upload." };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files are supported." };
  }

  const admin = createAdminClient();

  const { data: character, error: characterError } = await admin
    .from("characters")
    .select("id, project_id, role")
    .eq("id", characterId)
    .maybeSingle();

  if (characterError) {
    return { ok: false, error: characterError.message };
  }
  if (!character) {
    return { ok: false, error: "Character not found." };
  }

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

  const { data: assetRow, error: assetError } = await admin
    .from("assets")
    .insert({
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

  const { error: updateError } = await admin
    .from("characters")
    .update({ reference_asset_id: assetRow.id })
    .eq("id", characterId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/characters");
  revalidatePath("/assets");
  return { ok: true };
}
