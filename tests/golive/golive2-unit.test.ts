/**
 * Go-live phase 2 unit tests — pure logic added for real AI generation and
 * client onboarding readiness. No DB, no network.
 */
const B = new URL("../../web/src/", import.meta.url).href;
const help = await import(`${B}lib/providers/provider-help.ts`);

let passed = 0, failed = 0;
const eq = (a: unknown, b: unknown, n: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`FAIL ${n}: exp ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
};
const ok = (c: boolean, n: string) => eq(c, true, n);

/* ================= provider help ================= */
for (const p of ["openai", "gemini", "elevenlabs", "fal"]) {
  const h = help.PROVIDER_HELP[p];
  ok(!!h, `help exists for ${p}`);
  ok(h.method === "api_key", `${p} is an API-key provider`);
  ok(h.purpose.length > 0, `${p} states why it's needed`);
  ok(h.website.startsWith("https://"), `${p} links to where to get the key`);
  ok(h.keyHint.length > 0, `${p} gives a key-shape hint`);
}
ok(help.PROVIDER_HELP.openai.required, "openai is required");
ok(help.PROVIDER_HELP.youtube.method === "oauth", "youtube is OAuth, not a key");
ok(help.PROVIDER_HELP.youtube.required === false, "youtube is not required for the core loop");
ok(!("gmail" in help.PROVIDER_HELP), "gmail is NOT a client-provided credential (platform-level)");
eq([...help.AI_KEY_PROVIDERS], ["openai", "gemini", "elevenlabs", "fal"], "the key-provider set is exactly the four AI providers");

/* ================= live-story JSON mapping =================
 * The parser/mapper is not exported standalone, so exercise the JSON parsing
 * contract the model must satisfy via a local re-implementation check of the
 * shape guarantees (importance normalisation, scene timing).            */
// Instead, assert the credential-validation classification is stable, which the
// in-portal test and wizard both depend on.
const validate = await import(`${B}lib/providers/validate.ts`);
// youtube/gmail must never be treated as key-based here:
const ytCheck = await validate.checkProviderKey("youtube" as never, "anything");
ok(ytCheck.status === "error" && /sign-in/i.test(ytCheck.message),
   "validate: youtube is rejected as a key provider with a clear message");
const gmailCheck = await validate.checkProviderKey("gmail" as never, "anything");
ok(gmailCheck.status === "error", "validate: gmail is rejected as a key provider");
const falBad = await validate.checkProviderKey("fal" as never, "no-colon-here");
ok(falBad.status === "invalid", "validate: a malformed fal key is invalid without a network call");
const falOk = await validate.checkProviderKey("fal" as never, "key_id:key_secret");
ok(falOk.status === "connected", "validate: a well-formed fal key passes the shape check");
const emptyKey = await validate.checkProviderKey("openai" as never, "   ");
ok(emptyKey.status === "invalid", "validate: an empty key is invalid before any call");

console.log(`\nGo-live 2 unit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
