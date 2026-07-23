/**
 * REAL generation → render → MP4-in-bucket → publish-can-find-it chain.
 *
 * - real OpenAI script generation (client's Vault key)
 * - enqueue render.run (as approveStage does)
 * - run the REAL Python render worker (subprocess) → real MP4
 * - verify the MP4 is in the Storage bucket, tenant-scoped and isolated
 * - verify the web publish path (findRenderedAsset) locates it
 * No YouTube in this test. Full cleanup (DB + bucket).
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const requireWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createClient } = requireWeb("@supabase/supabase-js");

const val = (f: string, k: string): string | null => {
  try {
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = l.match(new RegExp(`^${k}\\s*=\\s*(.*)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* */ }
  return null;
};
const WEBENV = new URL("../../web/.env.local", import.meta.url).pathname.replace(/^\//, "");
const ROOTENV = new URL("../../.env", import.meta.url).pathname.replace(/^\//, "");
const SUPA_URL = val(WEBENV, "NEXT_PUBLIC_SUPABASE_URL")!;
const SVC = val(WEBENV, "SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = val(WEBENV, "NEXT_PUBLIC_SUPABASE_ANON_KEY")!;
const OPENAI = val(ROOTENV, "OPENAI_API_KEY");
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SVC;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
process.env.OPENAI_TEXT_MODEL = "gpt-4o-mini";

const admin = createClient(SUPA_URL, SVC, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const ok = (c: boolean, n: string) => { if (c) passed++; else { failed++; console.error("FAIL " + n); } };

if (!OPENAI) { console.log("SKIP: no OPENAI_API_KEY"); process.exit(0); }

const L = new URL("../../web/src/lib", import.meta.url).href;
const { runStoryGeneration } = await import(`${L}/pipeline/generation.ts`);
const { enqueue } = await import(`${L}/jobs/engine.ts`);
const { renderJobKey } = await import(`${L}/jobs/handlers/render.ts`);

const stamp = Date.now();
const mkTenant = async (label: string) => (await admin.from("tenants")
  .insert({ name: `ZZ-e2e-${label}-${stamp}`, slug: `zz-e2e-${label}-${stamp}`, status: "active" })
  .select("id").single()).data.id as string;
const A = await mkTenant("a");
const B = await mkTenant("b");

try {
  await admin.from("tenant_settings").insert({ tenant_id: A, industry: "science education", keywords: ["space"] });
  await admin.rpc("store_credential", { p_tenant: A, p_provider: "openai", p_secret: OPENAI, p_meta: {} });

  console.log("1) REAL AI generation…");
  const gen = await runStoryGeneration({
    tenantId: A, topicInput: "Why leaves change color in autumn, for kids",
    settings: { niche: "science", language: "English", targetSeconds: 30, industry: "science", keywords: ["nature"] },
    mode: "live", client: admin,
  });
  ok(gen.mode === "live" && gen.provider === "openai", "real AI generation ran (openai, live)");
  const storyId = gen.storyId;

  // The run the generation created.
  const { data: run } = await admin.from("pipeline_runs").select("id").eq("story_id", storyId).eq("tenant_id", A).single();
  const runId = run.id as string;

  console.log("2) enqueue render.run…");
  const job = await enqueue({
    tenantId: A, type: "render.run", idempotencyKey: renderJobKey(runId),
    payload: { runId, storyId }, priority: 8, timeoutMs: 900_000,
  }, admin);
  ok(job.type === "render.run" && job.status === "queued", "render.run job enqueued");

  // The web worker must NOT claim it (excluded type).
  const { claim } = await import(`${L}/jobs/engine.ts`);
  const webClaim = await claim("web-probe", 25, admin);
  ok(!webClaim.some((j: { type: string }) => j.type === "render.run"), "the WEB worker does not claim render.run (type routing)");
  // release anything the probe accidentally claimed
  for (const j of webClaim) await admin.from("jobs").update({ status: "queued", locked_by: null }).eq("id", j.id);

  console.log("3) run the REAL Python render worker (mock-mode MP4)…");
  const out = execFileSync(
    new URL("../../.venv/Scripts/python.exe", import.meta.url).pathname.replace(/^\//, ""),
    ["-m", "pipeline.render_worker", "--limit", "1"],
    { cwd: new URL("../../", import.meta.url).pathname.replace(/^\//, ""), encoding: "utf8", timeout: 300_000 }
  );
  console.log("   worker:", out.trim().split("\n").pop());

  console.log("4) verify the render artifact…");
  const { data: jobAfter } = await admin.from("jobs").select("status, checkpoint").eq("id", job.id).single();
  ok(jobAfter.status === "succeeded", `render job succeeded (got ${jobAfter.status})`);

  const { data: assets } = await admin.from("assets").select("kind, storage_path, tenant_id, meta").eq("tenant_id", A).eq("story_id", storyId);
  const render = (assets ?? []).find((a: { kind: string }) => a.kind === "render");
  ok(!!render, "a render asset row exists, tenant-scoped");
  ok(!!render && !render.storage_path.includes("\\") && !render.storage_path.startsWith("http"),
     "the render storage_path is a BUCKET path (not a local file path)");
  ok(!!render && render.storage_path.startsWith(`${A}/`), "the render is stored under the tenant's own prefix");

  // The file really exists in the bucket and is non-empty.
  const { data: dl } = await admin.storage.from("assets").download(render.storage_path);
  const size = dl ? (await dl.arrayBuffer()).byteLength : 0;
  ok(size > 1000, `the MP4 is a real non-empty file in the bucket (${size} bytes)`);

  console.log("5) verify the web publish path can find it…");
  const { findRenderedAsset } = await import(`${L}/publishing/youtube-upload.ts`);
  const found = await findRenderedAsset(admin, { tenantId: A, runId, storyId });
  ok(found === render.storage_path, "findRenderedAsset() locates the rendered MP4");

  // Tenant isolation: B sees no render asset for A.
  const foundByB = await findRenderedAsset(admin, { tenantId: B, runId, storyId });
  ok(foundByB === null, "TENANT ISOLATION: workspace B cannot resolve A's rendered video");

  // Idempotency: re-running the worker adopts the existing render (no duplicate).
  await admin.from("jobs").update({ status: "queued", locked_by: null, lease_expires_at: null }).eq("id", job.id);
  execFileSync(new URL("../../.venv/Scripts/python.exe", import.meta.url).pathname.replace(/^\//, ""),
    ["-m", "pipeline.render_worker", "--limit", "1"],
    { cwd: new URL("../../", import.meta.url).pathname.replace(/^\//, ""), encoding: "utf8", timeout: 120_000 });
  const { count: renderCount } = await admin.from("assets").select("id", { count: "exact", head: true })
    .eq("tenant_id", A).eq("story_id", storyId).eq("kind", "render");
  ok(renderCount === 1, `re-render is idempotent — exactly one render asset (got ${renderCount})`);
} finally {
  for (const tid of [A, B]) {
    // remove bucket objects
    try {
      const { data: list } = await admin.storage.from("assets").list(`${tid}/renders`);
      // nested per-run folders; list & remove
      const { data: runs } = await admin.storage.from("assets").list(`${tid}/renders`);
      for (const r of runs ?? []) {
        const { data: files } = await admin.storage.from("assets").list(`${tid}/renders/${r.name}`);
        if (files?.length) await admin.storage.from("assets").remove(files.map((f: { name: string }) => `${tid}/renders/${r.name}/${f.name}`));
      }
      void list;
    } catch { /* */ }
    for (const tbl of ["jobs","assets","quality_scores","compliance_checks","decision_records",
                       "content_memory","api_usage","pipeline_stages","pipeline_runs","scenes",
                       "stories","notifications","audit_log","provider_health","event_log",
                       "security_incidents","tenant_settings"]) {
      await admin.from(tbl).delete().eq("tenant_id", tid);
    }
    await admin.from("tenants").delete().eq("id", tid);
  }
  console.log("(cleaned up)");
}
console.log(`\nRender chain: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
