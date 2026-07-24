"use server";

import { revalidatePath } from "next/cache";
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
