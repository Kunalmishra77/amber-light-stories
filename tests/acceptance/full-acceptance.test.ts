/**
 * FULL v1.0 ACCEPTANCE TEST — real, end to end, no mocks for the external legs.
 *
 *   create tenant → real client AI credential (Vault) → REAL AI generation
 *   → enqueue render → REAL Python render worker → REAL MP4 in the bucket
 *   → connect YouTube (real refresh token in Vault, as OAuth would store)
 *   → REAL publish → REAL upload to the authorized YouTube channel (PRIVATE)
 *   → confirm exactly ONE published video → REAL analytics ingest call
 *   → DELETE the uploaded video (leave the channel clean) → full cleanup.
 *
 * Uploads as PRIVATE and deletes immediately after verification.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const requireWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createClient } = requireWeb("@supabase/supabase-js");
const { google } = requireWeb("googleapis");

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
const G_ID = val(ROOTENV, "GOOGLE_CLIENT_ID");
const G_SECRET = val(ROOTENV, "GOOGLE_CLIENT_SECRET");
const G_REFRESH = val(ROOTENV, "GOOGLE_REFRESH_TOKEN");

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SVC;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
process.env.OPENAI_TEXT_MODEL = "gpt-4o-mini";
process.env.APP_URL = "http://localhost:3000"; // avoid the headers() origin path
// The web OAuth config falls back to these when GOOGLE_OAUTH_* aren't set.
if (G_ID) process.env.GOOGLE_CLIENT_ID = G_ID;
if (G_SECRET) process.env.GOOGLE_CLIENT_SECRET = G_SECRET;

const admin = createClient(SUPA_URL, SVC, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const ok = (c: boolean, n: string) => { if (c) { passed++; console.log("  ok  " + n); } else { failed++; console.error("  FAIL " + n); } };

const missing = [!OPENAI && "OPENAI_API_KEY", !G_ID && "GOOGLE_CLIENT_ID", !G_SECRET && "GOOGLE_CLIENT_SECRET", !G_REFRESH && "GOOGLE_REFRESH_TOKEN"].filter(Boolean);
if (missing.length) { console.log(`SKIP: missing ${missing.join(", ")}`); process.exit(0); }

const L = new URL("../../web/src/lib", import.meta.url).href;
const { runStoryGeneration } = await import(`${L}/pipeline/generation.ts`);
const { enqueue } = await import(`${L}/jobs/engine.ts`);
const { renderJobKey } = await import(`${L}/jobs/handlers/render.ts`);
const { publishRun } = await import(`${L}/publishing/publish.ts`);
const { ingestTenantAnalytics } = await import(`${L}/analytics/ingest.ts`);

let uploadedVideoId: string | null = null;
const stamp = Date.now();
const A = (await admin.from("tenants").insert({ name: `ZZ-accept-${stamp}`, slug: `zz-accept-${stamp}`, status: "active" }).select("id").single()).data.id as string;

async function deleteYouTubeVideo(id: string) {
  const oauth = new google.auth.OAuth2(G_ID, G_SECRET);
  oauth.setCredentials({ refresh_token: G_REFRESH });
  const yt = google.youtube({ version: "v3", auth: oauth });
  await yt.videos.delete({ id });
}

try {
  await admin.from("tenant_settings").insert({ tenant_id: A, industry: "science education", keywords: ["nature"] });
  await admin.rpc("store_credential", { p_tenant: A, p_provider: "openai", p_secret: OPENAI, p_meta: {} });

  console.log("\n1) REAL AI generation");
  const gen = await runStoryGeneration({
    tenantId: A, topicInput: "A tiny seed grows into a great tree — a 20 second fable",
    settings: { niche: "fables", language: "English", targetSeconds: 20, industry: "kids", keywords: ["nature"] },
    mode: "live", client: admin,
  });
  ok(gen.mode === "live", "AI generation ran live");
  const storyId = gen.storyId;
  const runId = (await admin.from("pipeline_runs").select("id").eq("story_id", storyId).eq("tenant_id", A).single()).data.id as string;

  console.log("\n2) enqueue render + run the REAL render worker");
  await enqueue({ tenantId: A, type: "render.run", idempotencyKey: renderJobKey(runId), payload: { runId, storyId }, priority: 8, timeoutMs: 900_000 }, admin);
  execFileSync(new URL("../../.venv/Scripts/python.exe", import.meta.url).pathname.replace(/^\//, ""),
    ["-m", "pipeline.render_worker", "--limit", "1"],
    { cwd: new URL("../../", import.meta.url).pathname.replace(/^\//, ""), encoding: "utf8", timeout: 300_000 });
  const renderAsset = (await admin.from("assets").select("storage_path").eq("tenant_id", A).eq("story_id", storyId).eq("kind", "render").maybeSingle()).data;
  ok(!!renderAsset && renderAsset.storage_path.startsWith(`${A}/`), "a real MP4 is in the bucket, tenant-scoped");

  console.log("\n3) connect YouTube (store the real refresh token as OAuth would)");
  await admin.rpc("store_credential", {
    p_tenant: A, p_provider: "youtube", p_secret: G_REFRESH,
    p_meta: { external_channel_id: val(ROOTENV, "YT_CHANNEL_ID") ?? "authorized", connected_at: new Date().toISOString() },
  });
  const channelId = (await admin.from("channels").insert({
    tenant_id: A, provider: "youtube", external_channel_id: val(ROOTENV, "YT_CHANNEL_ID") ?? "authorized",
    yt_channel_id: val(ROOTENV, "YT_CHANNEL_ID") ?? "authorized", title: "Acceptance test channel", name: "Acceptance", status: "connected",
  }).select("id").single()).data.id as string;
  await admin.from("tenant_credentials").update({ status: "connected" }).eq("tenant_id", A).eq("provider", "youtube");
  ok(!!channelId, "YouTube channel connected for the tenant");

  console.log("\n4) REAL publish — upload the MP4 to the authorized YouTube channel (PRIVATE)");
  const pub = await publishRun({ tenantId: A, runId, storyId, mode: "live", client: admin });
  uploadedVideoId = pub.externalVideoId;
  ok(pub.mode === "live" && !!pub.externalVideoId && !pub.externalVideoId.startsWith("dry_"),
     `REAL upload succeeded — YouTube video id ${pub.externalVideoId}`);

  console.log("\n5) confirm exactly one published video");
  const { data: vids, count } = await admin.from("videos").select("id, status, yt_video_id", { count: "exact" })
    .eq("tenant_id", A).eq("status", "published");
  ok(count === 1, `exactly one published video row (got ${count})`);
  ok(vids?.[0]?.yt_video_id === uploadedVideoId, "the video row carries the real YouTube id");

  // Verify it really exists on YouTube.
  const oauth = new google.auth.OAuth2(G_ID, G_SECRET);
  oauth.setCredentials({ refresh_token: G_REFRESH });
  const yt = google.youtube({ version: "v3", auth: oauth });
  const check = await yt.videos.list({ part: ["status", "snippet"], id: [uploadedVideoId] });
  const item = check.data.items?.[0];
  ok(!!item, "the video is really present on the YouTube channel");
  ok(item?.status?.privacyStatus === "private", "it was uploaded PRIVATE (not public)");
  console.log(`   uploaded: "${item?.snippet?.title}" (${item?.status?.privacyStatus})`);

  console.log("\n6) idempotent re-publish must NOT create a second video");
  const pub2 = await publishRun({ tenantId: A, runId, storyId, mode: "live", client: admin });
  ok(pub2.alreadyPublished === true && pub2.externalVideoId === uploadedVideoId, "re-publish returns the existing video (no duplicate upload)");
  const { count: count2 } = await admin.from("videos").select("id", { count: "exact", head: true }).eq("tenant_id", A).eq("status", "published");
  ok(count2 === 1, "still exactly one published video after a re-publish");

  console.log("\n7) REAL analytics ingest (live)");
  const ing = await ingestTenantAnalytics({ tenantId: A, mode: "live", client: admin });
  // A brand-new private video usually has no analytics rows yet; the call must
  // succeed (real access token, real API) — that is what we verify.
  ok(ing.mode === "live", `analytics ingest ran live (videos=${ing.videos}, ingested=${ing.ingested})`);
} finally {
  if (uploadedVideoId) {
    try { await deleteYouTubeVideo(uploadedVideoId); console.log(`\n(deleted test video ${uploadedVideoId} from YouTube)`); }
    catch (e) { console.error("!! COULD NOT DELETE TEST VIDEO — delete it manually:", uploadedVideoId, (e as Error).message); }
  }
  try {
    const { data: runs } = await admin.storage.from("assets").list(`${A}/renders`);
    for (const r of runs ?? []) {
      const { data: files } = await admin.storage.from("assets").list(`${A}/renders/${r.name}`);
      if (files?.length) await admin.storage.from("assets").remove(files.map((f: { name: string }) => `${A}/renders/${r.name}/${f.name}`));
    }
  } catch { /* */ }
  for (const tbl of ["jobs","assets","analytics","quality_scores","compliance_checks","decision_records",
                     "content_memory","api_usage","videos","channels","tenant_credentials","pipeline_stages",
                     "pipeline_runs","scenes","stories","notifications","audit_log","provider_health",
                     "event_log","security_incidents","tenant_settings","projects"]) {
    await admin.from(tbl).delete().eq("tenant_id", A);
  }
  await admin.from("tenants").delete().eq("id", A);
  console.log("(cleaned up test tenant)");
}
console.log(`\nFULL ACCEPTANCE: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
