"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantId, requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/ops/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Disconnects the workspace's YouTube channel: revokes the grant at Google,
 * then clears the local credential and channel status. Gated on
 * `channels.manage` — disconnecting stops all publishing.
 */
export async function disconnectYouTube(): Promise<ActionResult> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return { ok: false, error: "You're not a member of any workspace." };
  if (!(await requirePermission("channels.manage", tenantId))) {
    return { ok: false, error: "You don't have permission to manage channels." };
  }

  try {
    const { disconnectChannel } = await import("@/lib/providers/youtube-oauth");
    await disconnectChannel(tenantId);
  } catch (err) {
    console.error(
      "[youtube] disconnect failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return { ok: false, error: "Couldn't fully disconnect. Please try again." };
  }

  await logAudit({
    action: "youtube.disconnected",
    target: `tenant:${tenantId}`,
    meta: {},
    tenantId,
  });

  revalidatePath("/youtube");
  revalidatePath("/publishing");
  return { ok: true };
}
