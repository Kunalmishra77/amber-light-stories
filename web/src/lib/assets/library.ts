import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Unified, versioned, governed Asset Library (M12 G1 — ADR-041 / ADR-049).
 * ONE library for prompt templates, characters, style packs, brand voices and
 * voice profiles. Guarantees enforced here + in the DB:
 *   - versions are IMMUTABLE once approved (DB trigger, not a convention)
 *   - exactly ONE active version per item (single FK column)
 *   - explicit governance state transitions
 *   - copy-on-use records provenance instead of duplicating silently
 */
export type AssetKind = "prompt_template" | "character" | "style_pack" | "brand_voice" | "voice_profile";
export type GovernanceState = "draft" | "in_review" | "approved" | "archived";
export type VersionState = "draft" | "approved" | "published" | "archived";
export type BindingRelation = "voice" | "style" | "brand_voice";

export interface AssetItem {
  id: string;
  tenant_id: string;
  kind: string;
  key: string;
  name: string;
  description: string | null;
  active_version_id: string | null;
  governance_state: string;
  origin_item_id: string | null;
  tags: string[];
}

export interface AssetVersion {
  id: string;
  tenant_id: string;
  item_id: string;
  version: number;
  body: Record<string, unknown>;
  state: string;
  immutable: boolean;
  checksum: string | null;
}

/** Stable checksum of a version body (integrity + duplicate detection). */
export function bodyChecksum(body: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

/** Normalize a human name into a stable per-(tenant,kind) key. */
export function assetKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
}

async function db(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createClient());
}

/** Create an item with its first (draft) version. */
export async function createAsset(
  input: { tenantId: string; kind: AssetKind; name: string; key?: string; description?: string; body: Record<string, unknown>; tags?: string[]; createdBy?: string | null },
  client?: SupabaseClient
): Promise<{ item: AssetItem; version: AssetVersion }> {
  const sb = await db(client);
  const key = input.key ?? assetKey(input.name);

  const { data: item, error } = await sb
    .from("asset_library_items")
    .insert({
      tenant_id: input.tenantId,
      kind: input.kind,
      key,
      name: input.name,
      description: input.description ?? null,
      tags: input.tags ?? [],
      governance_state: "draft",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error || !item) throw new Error(error?.message ?? "Couldn't create the asset.");

  const version = await addAssetVersion(item.id as string, input.body, { createdBy: input.createdBy }, sb);
  return { item: item as AssetItem, version };
}

/** Append the next immutable-candidate version (always starts as draft). */
export async function addAssetVersion(
  itemId: string,
  body: Record<string, unknown>,
  opts?: { notes?: string; createdBy?: string | null },
  client?: SupabaseClient
): Promise<AssetVersion> {
  const sb = await db(client);
  const { data: item } = await sb
    .from("asset_library_items")
    .select("id, tenant_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) throw new Error("Asset not found.");

  const { data: last } = await sb
    .from("asset_versions")
    .select("version")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = ((last?.version as number) ?? 0) + 1;

  const { data, error } = await sb
    .from("asset_versions")
    .insert({
      tenant_id: item.tenant_id,
      item_id: itemId,
      version: next,
      body,
      checksum: bodyChecksum(body),
      state: "draft",
      immutable: false,
      notes: opts?.notes ?? null,
      created_by: opts?.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't add the version.");
  return data as AssetVersion;
}

/**
 * Approve a version: it becomes IMMUTABLE (the DB trigger then refuses any
 * content edit). Approval is the governance boundary.
 */
export async function approveAssetVersion(
  versionId: string,
  approvedBy: string | null,
  client?: SupabaseClient
): Promise<AssetVersion> {
  const sb = await db(client);
  const { data, error } = await sb
    .from("asset_versions")
    .update({ state: "approved", immutable: true, approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq("id", versionId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't approve the version.");
  return data as AssetVersion;
}

/**
 * Make a version the item's ACTIVE one. Only approved/published versions may
 * be activated, and activating replaces the previous active (exactly one).
 */
export async function activateAssetVersion(
  itemId: string,
  versionId: string,
  client?: SupabaseClient
): Promise<void> {
  const sb = await db(client);
  const { data: version } = await sb
    .from("asset_versions")
    .select("id, item_id, state")
    .eq("id", versionId)
    .maybeSingle();
  if (!version || version.item_id !== itemId) throw new Error("Version does not belong to this asset.");
  if (!["approved", "published"].includes(version.state as string)) {
    throw new Error("Only an approved version can be activated.");
  }
  await sb.from("asset_versions").update({ state: "published" }).eq("id", versionId);
  const { error } = await sb
    .from("asset_library_items")
    .update({ active_version_id: versionId, governance_state: "approved", updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

/** The active version body for an asset, or null when none is active yet. */
export async function getActiveAsset(
  tenantId: string,
  kind: AssetKind,
  key: string,
  client?: SupabaseClient
): Promise<{ item: AssetItem; version: AssetVersion } | null> {
  const sb = await db(client);
  const { data: item } = await sb
    .from("asset_library_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("key", key)
    .maybeSingle();
  if (!item?.active_version_id) return null;
  const { data: version } = await sb
    .from("asset_versions")
    .select("*")
    .eq("id", item.active_version_id)
    .maybeSingle();
  if (!version) return null;
  return { item: item as AssetItem, version: version as AssetVersion };
}

/**
 * Copy-on-use adoption (ADR-006/049): copy a source asset's ACTIVE version into
 * a tenant as a new, independently-versioned item that records its provenance.
 * The copy is decoupled — later changes to the source never mutate the copy.
 */
export async function copyAssetOnUse(
  input: { sourceItemId: string; targetTenantId: string; name?: string; createdBy?: string | null },
  client?: SupabaseClient
): Promise<{ item: AssetItem; version: AssetVersion }> {
  const sb = await db(client);
  const { data: source } = await sb
    .from("asset_library_items")
    .select("*")
    .eq("id", input.sourceItemId)
    .maybeSingle();
  if (!source) throw new Error("Source asset not found.");
  if (!source.active_version_id) throw new Error("Source asset has no active version to copy.");

  const { data: sourceVersion } = await sb
    .from("asset_versions")
    .select("*")
    .eq("id", source.active_version_id)
    .maybeSingle();
  if (!sourceVersion) throw new Error("Source active version not found.");

  const name = input.name ?? (source.name as string);
  // Keep the key stable but unique within the adopting tenant.
  let key = source.key as string;
  const { data: clash } = await sb
    .from("asset_library_items")
    .select("id")
    .eq("tenant_id", input.targetTenantId)
    .eq("kind", source.kind)
    .eq("key", key)
    .maybeSingle();
  if (clash) key = `${key}-copy-${Math.floor(Date.now() / 1000)}`;

  const { data: item, error } = await sb
    .from("asset_library_items")
    .insert({
      tenant_id: input.targetTenantId,
      kind: source.kind,
      key,
      name,
      description: source.description,
      tags: source.tags ?? [],
      governance_state: "draft",
      origin_item_id: source.id,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error || !item) throw new Error(error?.message ?? "Couldn't adopt the asset.");

  const version = await addAssetVersion(
    item.id as string,
    (sourceVersion.body as Record<string, unknown>) ?? {},
    { notes: `Copied from ${source.id} v${sourceVersion.version}`, createdBy: input.createdBy },
    sb
  );
  return { item: item as AssetItem, version };
}

/** Bind two assets (character -> voice_profile, character -> style_pack, …). */
export async function bindAssets(
  input: { tenantId: string; itemId: string; boundItemId: string; relation: BindingRelation },
  client?: SupabaseClient
): Promise<void> {
  const sb = await db(client);
  const { error } = await sb.from("asset_bindings").insert({
    tenant_id: input.tenantId,
    item_id: input.itemId,
    bound_item_id: input.boundItemId,
    relation: input.relation,
  });
  // A duplicate binding is a no-op, not an error.
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** Assets bound to an item (for continuity resolution during generation). */
export async function getBoundAssets(
  itemId: string,
  relation: BindingRelation,
  client?: SupabaseClient
): Promise<AssetItem[]> {
  const sb = await db(client);
  const { data } = await sb
    .from("asset_bindings")
    .select("bound_item_id")
    .eq("item_id", itemId)
    .eq("relation", relation);
  const ids = ((data ?? []) as { bound_item_id: string }[]).map((b) => b.bound_item_id);
  if (ids.length === 0) return [];
  const { data: items } = await sb.from("asset_library_items").select("*").in("id", ids);
  return (items ?? []) as AssetItem[];
}

/** List a tenant's assets of a kind (governance surface). */
export async function listAssets(
  tenantId: string,
  kind?: AssetKind,
  client?: SupabaseClient
): Promise<AssetItem[]> {
  const sb = await db(client);
  let q = sb.from("asset_library_items").select("*").eq("tenant_id", tenantId);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q.order("kind", { ascending: true }).order("name", { ascending: true });
  return (data ?? []) as AssetItem[];
}
