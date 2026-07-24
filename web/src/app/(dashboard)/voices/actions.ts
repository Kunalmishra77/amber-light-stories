"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId } from "@/lib/auth";
import { denyUnless, PERMISSIONS } from "@/lib/authz";
import { logAudit } from "@/lib/ops/audit";
import { getTenantCredential } from "@/lib/providers/tenant-providers";
import {
  listElevenLabsVoices,
  VOICE_CREDENTIAL,
  type ElevenLabsVoice,
} from "@/lib/providers/elevenlabs-voices";

export interface VoicesResult {
  ok: boolean;
  voices?: ElevenLabsVoice[];
  error?: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Fetches the voices on the tenant's own ElevenLabs account. Runs server-side
 * so the API key never reaches the browser.
 */
export async function fetchVoicesAction(): Promise<VoicesResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  const apiKey = await getTenantCredential(tenantId, "elevenlabs");
  if (!apiKey) {
    return {
      ok: false,
      error: "Add your ElevenLabs API key in API Management first.",
    };
  }

  try {
    const voices = await listElevenLabsVoices(apiKey);
    if (voices.length === 0) {
      return { ok: false, error: "That ElevenLabs account has no voices yet." };
    }
    return { ok: true, voices };
  } catch {
    // Never echo the provider error — it can contain request details.
    return { ok: false, error: "Couldn't reach ElevenLabs. Check the key and try again." };
  }
}

/** Audio types the private `assets` bucket accepts (migration 041). */
const MUSIC_TYPES = new Set(["audio/mpeg", "audio/mp4"]);
const MUSIC_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Uploads the channel's background-music bed. The renderer ducks it under the
 * narration automatically; the render worker picks up the most recent
 * `kind: "music"` asset for the workspace, so uploading a new track replaces
 * the old one for future videos.
 */
export async function uploadMusicAction(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.credentialsManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can change the music." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an audio file." };
  }
  if (file.type && !MUSIC_TYPES.has(file.type)) {
    return { ok: false, error: "Use an MP3 or M4A file." };
  }
  if (file.size > MUSIC_MAX_BYTES) {
    return { ok: false, error: "Keep the track under 20 MB." };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "Couldn't read the selected file." };
  }

  const extension = file.type === "audio/mp4" ? "m4a" : "mp3";
  // Tenant-prefixed path in the PRIVATE assets bucket, same convention as
  // every other asset — the worker only accepts bucket-relative paths.
  const path = `${tenantId}/music/${Date.now()}.${extension}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, bytes, { contentType: file.type || "audio/mpeg", upsert: true });
  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("assets").insert({
    tenant_id: tenantId,
    kind: "music",
    storage_path: path,
    tags: ["music"],
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({ action: "music.upload", target: "assets:music", tenantId });
  revalidatePath("/voices");
  return { ok: true };
}

/** Stores the chosen voice_id in the Vault for the render worker to pick up. */
export async function selectVoiceAction(voiceId: string): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (await denyUnless(PERMISSIONS.credentialsManage, tenantId)) {
    return { ok: false, error: "Only owners or managers can change the channel voice." };
  }

  const trimmed = voiceId.trim();
  if (!trimmed) return { ok: false, error: "Choose a voice first." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("store_credential", {
    p_tenant: tenantId,
    p_provider: VOICE_CREDENTIAL,
    p_secret: trimmed,
    p_meta: {},
  });
  if (error) {
    console.error("[voices] store_credential failed:", error.code ?? "unknown");
    return { ok: false, error: "Couldn't save the voice. Please try again." };
  }

  await logAudit({
    action: "voice.select",
    target: `${VOICE_CREDENTIAL}:${trimmed}`,
    tenantId,
  });

  revalidatePath("/voices");
  return { ok: true };
}
