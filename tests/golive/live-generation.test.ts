/**
 * REAL end-to-end AI generation smoke test.
 *
 * Uses the owner's real OpenAI key (from root .env) as an ISOLATED test
 * tenant's Vault credential, then runs the ACTUAL live generation code path —
 * gateway → real OpenAI call → story mapping → DB persistence. One cheap
 * gpt-4o-mini call. Verifies the story is genuinely AI-produced (not the mock
 * topic bank), tenant-isolated, and cost-recorded. Cleans up fully.
 *
 * This is NOT a mock: if OpenAI rejects the key or returns junk, it fails.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const requireWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createClient } = requireWeb("@supabase/supabase-js");

function envFrom(file: string, key: string): string | null {
  try {
    for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = l.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
  return null;
}

const SUPA_URL = envFrom(new URL("../../web/.env.local", import.meta.url).pathname.replace(/^\//, ""), "NEXT_PUBLIC_SUPABASE_URL")!;
const ANON = envFrom(new URL("../../web/.env.local", import.meta.url).pathname.replace(/^\//, ""), "NEXT_PUBLIC_SUPABASE_ANON_KEY")!;
const SVC = envFrom(new URL("../../web/.env.local", import.meta.url).pathname.replace(/^\//, ""), "SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI = envFrom(new URL("../../.env", import.meta.url).pathname.replace(/^\//, ""), "OPENAI_API_KEY");

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SVC;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
process.env.OPENAI_TEXT_MODEL = "gpt-4o-mini"; // cheapest, for the smoke test

const admin = createClient(SUPA_URL, SVC, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (c: boolean, n: string) => { if (c) passed++; else { failed++; console.error("FAIL " + n); } };

if (!OPENAI) {
  console.log("SKIP: no OPENAI_API_KEY available — cannot run a real generation test.");
  process.exit(0);
}

const L = new URL("../../web/src/lib", import.meta.url).href;
const { runStoryGeneration } = await import(`${L}/pipeline/generation.ts`);
const { getTenantCredential } = await import(`${L}/providers/tenant-providers.ts`);

const stamp = Date.now();
const { data: t } = await admin.from("tenants")
  .insert({ name: `ZZ-livegen-${stamp}`, slug: `zz-livegen-${stamp}`, status: "active" })
  .select("id").single();
const { data: other } = await admin.from("tenants")
  .insert({ name: `ZZ-livegen-other-${stamp}`, slug: `zz-livegen-other-${stamp}`, status: "active" })
  .select("id").single();
const A = t.id as string;
const B = other.id as string;

// The mock topic bank — a real generation must NOT match these.
const MOCK_TOPICS = new Set([
  "The Clever Fox and the Drum", "The Farmer and the Golden Goose",
  "The Ant and the Grasshopper, Revisited", "The Thirsty Crow's Clever Trick",
  "The Tortoise Who Outsmarted the Hare", "The Monkey and the Crocodile",
]);

try {
  await admin.from("tenant_settings").insert({ tenant_id: A, industry: "science education", keywords: ["space", "curiosity"] }).select().maybeSingle();

  // Store the real key as A's tenant credential via the Vault RPC.
  const { error: vaultErr } = await admin.rpc("store_credential", {
    p_tenant: A, p_provider: "openai", p_secret: OPENAI, p_meta: {},
  });
  ok(!vaultErr, "stored the real OpenAI key in A's Vault");

  // Tenant isolation: B must not be able to read A's credential.
  const bCred = await getTenantCredential(B, "openai");
  ok(bCred === null, "tenant isolation: B cannot read A's OpenAI credential from the Vault");
  const aCred = await getTenantCredential(A, "openai");
  ok(aCred === OPENAI, "A's own credential resolves from the Vault");

  console.log("Running REAL OpenAI generation (gpt-4o-mini)…");
  const t0 = Date.now();
  const result = await runStoryGeneration({
    tenantId: A,
    topicInput: "Why the sky is blue, explained for kids",
    settings: { niche: "science education", language: "English", targetSeconds: 45, industry: "science", keywords: ["space"] },
    mode: "live",
    client: admin,
  });
  console.log(`  generation returned in ${Date.now() - t0}ms, provider=${result.provider}, mode=${result.mode}`);

  ok(result.mode === "live", "generation ran in LIVE mode");
  ok(result.provider === "openai", "generation used the openai provider");

  const { data: story } = await admin.from("stories")
    .select("topic, logline, moral, beat_sheet").eq("id", result.storyId).single();
  console.log(`  topic: "${story.topic}"`);
  ok(!!story.topic && !MOCK_TOPICS.has(story.topic), "the topic is REAL, not from the mock bank");
  ok((story.logline ?? "").length > 0, "the story has a real logline");
  const beat = story.beat_sheet as { source?: string; mock?: boolean; provider?: string; model?: string };
  ok(beat.source === "ai_generated" && beat.mock === false, "provenance is honestly marked ai_generated (not mock)");
  ok(beat.provider === "openai" && !!beat.model, "provenance records the real provider + model");

  const { data: scenes } = await admin.from("scenes").select("id, narration").eq("story_id", result.storyId);
  ok((scenes ?? []).length >= 2, `the story has real scenes (${(scenes ?? []).length})`);
  ok((scenes ?? []).every((s: { narration: string }) => (s.narration ?? "").length > 0), "every scene has narration");

  // Real cost recorded by the gateway.
  const { data: usage } = await admin.from("api_usage")
    .select("provider, cost_usd, endpoint").eq("tenant_id", A);
  const openaiUsage = (usage ?? []).filter((u: { provider: string }) => u.provider === "openai");
  ok(openaiUsage.length >= 1, "the AI Gateway recorded real api_usage for the call");
  console.log(`  recorded cost: $${openaiUsage.reduce((s: number, u: { cost_usd: number }) => s + Number(u.cost_usd ?? 0), 0).toFixed(6)}`);
} finally {
  // Full cleanup, both tenants.
  for (const tid of [A, B]) {
    const { data: st } = await admin.from("pipeline_stages").select("id").eq("tenant_id", tid);
    for (const s of st ?? []) await admin.from("pipeline_stages").update({ active_version_id: null }).eq("id", s.id);
    for (const tbl of ["quality_scores","compliance_checks","decision_records","content_memory","api_usage",
                       "pipeline_stages","pipeline_runs","scenes","stories","notifications","audit_log",
                       "provider_health","tenant_settings"]) {
      await admin.from(tbl).delete().eq("tenant_id", tid);
    }
    await admin.from("tenants").delete().eq("id", tid);
  }
  console.log("(cleaned up both test tenants)");
}

console.log(`\nLive generation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
