"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/profile");
  revalidatePath("/", "layout");
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const fullName = ((formData.get("full_name") as string | null) ?? "").trim();
  if (!fullName) return { ok: false, error: "Name can't be empty." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "profile.update", target: `profile:${user.id}` });

  revalidate();
  return { ok: true };
}

export interface UploadAvatarResult extends ActionResult {
  avatarUrl?: string;
}

/** Uploads a profile photo to the `assets` bucket — mirrors the character
 * reference-photo upload pattern (src/app/(dashboard)/characters/actions.ts). */
export async function uploadAvatar(formData: FormData): Promise<UploadAvatarResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You must be signed in to upload." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file to upload." };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files are supported." };
  }

  const supabase = await createClient();
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
  const path = `avatars/${user.id}/${Date.now()}.${extension || "jpg"}`;

  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

  const { data: publicUrlData } = admin.storage.from("assets").getPublicUrl(path);
  const avatarUrl = publicUrlData.publicUrl;

  const { error: saveError } = await supabase
    .from("profiles")
    .update({ avatar: avatarUrl })
    .eq("user_id", user.id);
  if (saveError) return { ok: false, error: saveError.message };

  await logAudit({ action: "profile.upload_avatar", target: `profile:${user.id}` });

  revalidate();
  return { ok: true, avatarUrl };
}
