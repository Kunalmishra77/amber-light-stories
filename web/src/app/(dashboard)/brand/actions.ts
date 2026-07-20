"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenantId, getSessionUser, isOwnerOrManager } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";
import { signAssetPath } from "@/lib/assets";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface TenantBrandFull {
  display_name: string;
  tagline: string | null;
  accent: string | null;
  logo_url: string | null;
  font: string | null;
  voice_tone: string | null;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function revalidate() {
  revalidatePath("/brand");
  revalidatePath("/", "layout");
}

/**
 * Saves the tenant's brand kit (display name, tagline, accent color, font,
 * voice/tone) into `tenant_settings.brand`. Gated to owner/manager — this
 * drives what every other member sees in the sidebar & topbar.
 */
export async function updateBrandKit(formData: FormData): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can edit the brand kit." };
  }

  const displayName = ((formData.get("display_name") as string | null) ?? "").trim();
  if (!displayName) return { ok: false, error: "Display name is required." };

  const tagline = ((formData.get("tagline") as string | null) ?? "").trim();
  const accent = ((formData.get("accent") as string | null) ?? "").trim();
  if (accent && !HEX_RE.test(accent)) {
    return { ok: false, error: "Accent color must be a hex value like #F59E0B." };
  }

  const font = ((formData.get("font") as string | null) ?? "Inter").trim();
  const voiceTone = ((formData.get("voice_tone") as string | null) ?? "").trim();
  const existingLogoUrl = ((formData.get("existing_logo_url") as string | null) ?? "").trim();

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("tenant_settings")
    .select("brand")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const currentBrand = (current?.brand ?? {}) as Partial<TenantBrandFull>;

  const brand: TenantBrandFull = {
    display_name: displayName,
    tagline: tagline || null,
    accent: accent || null,
    logo_url: existingLogoUrl || currentBrand.logo_url || null,
    font: font || "Inter",
    voice_tone: voiceTone || null,
  };

  const { error } = await supabase
    .from("tenant_settings")
    .update({ brand })
    .eq("tenant_id", tenantId);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    action: "brand.update",
    target: `tenant_settings:${tenantId}`,
    meta: { display_name: displayName },
    tenantId,
  });

  revalidate();
  return { ok: true };
}

export interface UploadLogoResult extends ActionResult {
  /** Signed URL for immediate display. */
  logoUrl?: string;
  /** Stable bucket path persisted in `logo_url` — the form round-trips this. */
  logoPath?: string;
}

/**
 * Uploads a logo file to the `assets` storage bucket and writes the
 * resulting public URL straight into `tenant_settings.brand.logo_url` —
 * mirrors the character reference-photo upload pattern
 * (src/app/(dashboard)/characters/actions.ts) but scoped to the tenant's
 * brand instead of a single character.
 */
export async function uploadBrandLogo(formData: FormData): Promise<UploadLogoResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You must be signed in to upload." };

  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };

  if (!(await isOwnerOrManager(tenantId))) {
    return { ok: false, error: "Only owners or managers can update the logo." };
  }

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
    : "png";
  const path = `branding/${tenantId}/logo-${Date.now()}.${extension || "png"}`;

  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/png",
      upsert: true,
    });
  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

  const { data: current } = await supabase
    .from("tenant_settings")
    .select("brand")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const currentBrand = (current?.brand ?? {}) as Partial<TenantBrandFull>;

  // Persist the STABLE bucket path in logo_url; the app resolves it to a
  // short-lived signed URL on read (private bucket, ISS-C2 / ADR-073).
  const { error: saveError } = await supabase
    .from("tenant_settings")
    .update({ brand: { ...currentBrand, logo_url: path } })
    .eq("tenant_id", tenantId);
  if (saveError) return { ok: false, error: saveError.message };

  // Return a signed URL for immediate in-form display.
  const logoUrl = (await signAssetPath(path)) ?? undefined;

  await logAudit({
    action: "brand.upload_logo",
    target: `tenant_settings:${tenantId}`,
    tenantId,
  });

  revalidate();
  return { ok: true, logoUrl, logoPath: path };
}
