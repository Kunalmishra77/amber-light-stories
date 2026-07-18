import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client authenticated with the service role key.
 *
 * This bypasses Row Level Security entirely, so it must never be imported
 * from a "use client" file and the key must never be exposed with a
 * NEXT_PUBLIC_ prefix. The `import "server-only"` above makes any accidental
 * client-side import fail at build time.
 *
 * Intended for single-owner dev use in Server Components / route handlers
 * until real auth + RLS policies are in place.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
