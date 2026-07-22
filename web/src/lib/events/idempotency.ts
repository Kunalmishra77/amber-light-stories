import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared idempotency store (M14 B1 — ADR-070). Turns AT-LEAST-ONCE delivery
 * into an EXACTLY-ONCE EFFECT.
 *
 * The guarantee is the unique index on (scope, key): the first delivery claims
 * the key by inserting; a concurrent or later duplicate hits the unique
 * violation, does NOT run the work, and returns the first delivery's result.
 * This is why duplicate events cannot produce duplicate side effects.
 */
export interface IdempotentOutcome<T> {
  result: T | null;
  executed: boolean;   // false => this was a duplicate delivery
  duplicate: boolean;
}

export async function withIdempotency<T extends Record<string, unknown>>(
  input: { scope: string; key: string; tenantId?: string | null; ttlMs?: number },
  work: () => Promise<T>,
  client?: SupabaseClient
): Promise<IdempotentOutcome<T>> {
  const db = client ?? createAdminClient();
  const expiresAt = input.ttlMs ? new Date(Date.now() + input.ttlMs).toISOString() : null;

  // Claim the key. Losing this race means someone already did (or is doing) it.
  const { error: claimError } = await db.from("idempotency_keys").insert({
    tenant_id: input.tenantId ?? null,
    scope: input.scope,
    key: input.key,
    status: "in_progress",
    expires_at: expiresAt,
  });

  if (claimError) {
    if (claimError.code === "23505") {
      const { data: existing } = await db
        .from("idempotency_keys")
        .select("result, status")
        .eq("scope", input.scope)
        .eq("key", input.key)
        .maybeSingle();
      return {
        result: (existing?.result as T) ?? null,
        executed: false,
        duplicate: true,
      };
    }
    throw new Error(claimError.message);
  }

  try {
    const result = await work();
    await db
      .from("idempotency_keys")
      .update({ status: "completed", result, completed_at: new Date().toISOString() })
      .eq("scope", input.scope)
      .eq("key", input.key);
    return { result, executed: true, duplicate: false };
  } catch (err) {
    // Release the claim so a retry can legitimately re-attempt the work.
    await db.from("idempotency_keys").delete().eq("scope", input.scope).eq("key", input.key);
    throw err;
  }
}
