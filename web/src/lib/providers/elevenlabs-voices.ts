import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lists the voices available on a tenant's OWN ElevenLabs account so they can
 * pick the one their channel narrates with. This is a FREE metadata call (the
 * same class as the credential checks in `validate.ts`) — no synthesis, no
 * paid usage. The key is used only for the outbound request; it is never
 * returned to the browser, logged, or persisted here.
 */
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  /** e.g. "premade" | "cloned" | "generated" — shown to help the user choose. */
  category?: string;
}

/**
 * Vault key the chosen narration voice is stored under. The render worker
 * reads exactly this credential per job (`pipeline/render_worker.py`
 * `_apply_tenant_env`) and exports it as ELEVENLABS_VOICE_ID, falling back to
 * a default when unset — so this string is a cross-service contract. Do not
 * rename it without changing the worker.
 *
 * It lives here rather than beside the server actions because a "use server"
 * module may only export async functions.
 */
export const VOICE_CREDENTIAL = "elevenlabs_voice";

/**
 * Reads the workspace's chosen voice_id from the Vault, or null when none has
 * been set (the worker then falls back to the platform default voice).
 *
 * `getTenantCredential` is deliberately typed to `ProviderKey` — the voice is
 * a setting, not a provider key, so it gets its own reader rather than
 * widening that type. Same contract as that helper: the CALLER must already
 * have gated the request to `tenantId`; this uses the service role.
 */
export async function getSelectedVoiceId(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_credential", {
    p_tenant: tenantId,
    p_provider: VOICE_CREDENTIAL,
  });
  if (error || !data) return null;
  return typeof data === "string" ? data : null;
}

const TIMEOUT_MS = 10_000;

export async function listElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs voices request failed (${res.status})`);
    }
    const body = (await res.json()) as {
      voices?: Array<{ voice_id?: string; name?: string; category?: string }>;
    };
    return (body.voices ?? [])
      .filter((v) => Boolean(v?.voice_id && v?.name))
      .map((v) => ({
        voice_id: v.voice_id as string,
        name: v.name as string,
        category: v.category,
      }));
  } finally {
    clearTimeout(timer);
  }
}
