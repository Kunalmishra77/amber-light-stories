/**
 * Asserts the security suite left nothing behind.
 *
 * Runs with `if: always()` in CI, so a suite that crashes half-way still gets
 * its fixtures reported. Test tenants and users are named `ZZ-*` / `zz-*`.
 */
import { createRequire } from "node:module";
const requireWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createClient } = requireWeb("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("no credentials configured — skipping the cleanliness check");
  process.exit(0);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
let leaked = 0;

const { data: tenants } = await admin.from("tenants").select("id, name").like("name", "ZZ-%");
if ((tenants ?? []).length > 0) {
  leaked += tenants.length;
  console.error(`LEAK: ${tenants.length} test tenant(s):`, tenants.map((t) => t.name).join(", "));
}

const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const testUsers = (users?.users ?? []).filter((u) => (u.email ?? "").startsWith("zz-"));
if (testUsers.length > 0) {
  leaked += testUsers.length;
  console.error(`LEAK: ${testUsers.length} test auth user(s)`);
  // Best-effort cleanup so a crashed run cannot poison the next one.
  for (const u of testUsers) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
    await admin.from("profiles").delete().eq("user_id", u.id);
  }
  console.error("  (removed)");
}

if (leaked === 0) {
  console.log("clean: no test tenants or users remain");
  process.exit(0);
}
// Tenants need the purge flag for stage_versions, so they are reported rather
// than force-deleted here — a human should look at why the suite aborted.
console.error("Run scripts/verify_recovery.py and clean up before merging.");
process.exit(1);
