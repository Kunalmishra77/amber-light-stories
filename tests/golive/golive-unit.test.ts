/**
 * Go-live phase unit tests — the pure logic that must be right before a real
 * YouTube account is ever connected. No database, no network.
 */
process.env.OAUTH_STATE_SECRET = "zz-test-state-secret-value";
process.env.GOOGLE_OAUTH_CLIENT_ID = "";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";

const B = new URL("../../web/src", import.meta.url).href;
const cfg = await import(`${B}/lib/providers/youtube-config.ts`);
const errors = await import(`${B}/lib/publishing/errors.ts`);
const pag = await import(`${B}/lib/pagination.ts`);

let passed = 0, failed = 0;
const eq = (a: unknown, b: unknown, n: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`FAIL ${n}: exp ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
};
const ok = (c: boolean, n: string) => eq(c, true, n);

/* ================= OAuth CSRF state ================= */
const T = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-2222-2222-222222222222";

const { state, nonce } = cfg.encodeState({ tenantId: T, userId: U });
const decoded = cfg.decodeState(state, nonce);
ok(decoded !== null, "a freshly issued state decodes");
eq(decoded?.tenantId, T, "state carries the tenant it was issued for");
eq(decoded?.userId, U, "state carries the user it was issued for");

ok(cfg.decodeState(state, null) === null, "state is rejected without the cookie nonce (CSRF)");
ok(cfg.decodeState(null, nonce) === null, "a missing state is rejected");
ok(cfg.decodeState(state, "some-other-nonce") === null,
   "state is rejected when the cookie nonce does not match (double-submit)");

const [payload, sig] = state.split(".");
ok(cfg.decodeState(`${payload}.${"A".repeat(sig.length)}`, nonce) === null,
   "a forged signature is rejected");

// Tamper with the payload while keeping the original signature.
const tampered = Buffer.from(
  JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), tenantId: "33333333-3333-3333-3333-333333333333" })
).toString("base64url");
ok(cfg.decodeState(`${tampered}.${sig}`, nonce) === null,
   "swapping the tenant id in the payload invalidates the signature");

ok(cfg.decodeState("not-a-state", nonce) === null, "malformed state is rejected");
ok(cfg.decodeState(`${payload}`, nonce) === null, "state without a signature is rejected");

// Expiry: forge a state issued 11 minutes ago using the real signing path.
const old = { tenantId: T, userId: U, nonce, issuedAt: Date.now() - 11 * 60 * 1000 };
const oldPayload = Buffer.from(JSON.stringify(old)).toString("base64url");
const { createHmac } = await import("node:crypto");
const oldSig = createHmac("sha256", process.env.OAUTH_STATE_SECRET!).update(oldPayload).digest("base64url");
ok(cfg.decodeState(`${oldPayload}.${oldSig}`, nonce) === null,
   "a correctly-signed but EXPIRED state is rejected");

const fresh = { ...old, issuedAt: Date.now() };
const freshPayload = Buffer.from(JSON.stringify(fresh)).toString("base64url");
const freshSig = createHmac("sha256", process.env.OAUTH_STATE_SECRET!).update(freshPayload).digest("base64url");
ok(cfg.decodeState(`${freshPayload}.${freshSig}`, nonce) !== null,
   "...and the same state within the TTL is accepted (the expiry test is real)");

const a = cfg.encodeState({ tenantId: T, userId: U });
const b = cfg.encodeState({ tenantId: T, userId: U });
ok(a.nonce !== b.nonce, "each flow gets a unique nonce");
ok(a.state !== b.state, "each flow gets a unique state");
ok(cfg.decodeState(a.state, b.nonce) === null, "a nonce from one flow cannot validate another's state");

/* ================= configuration gating ================= */
ok(cfg.isOAuthConfigured() === false, "OAuth reports NOT configured when no client id is set");
process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
ok(cfg.isOAuthConfigured() === true, "OAuth reports configured once both halves are set");
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "";
ok(cfg.isOAuthConfigured() === false, "a client id WITHOUT a secret is not 'configured'");
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
eq(cfg.getOAuthConfig()?.clientId, "id", "config returns the dedicated OAuth client id");

/* ================= error classification ================= */
ok(new errors.YouTubeUploadError("x").retryable === true, "upload errors are retryable by default");
ok(new errors.YouTubeUploadError("x", false).retryable === false, "...and can be marked terminal");
ok(new errors.YouTubeAuthError("x").needsReconnect === true, "auth errors ask for a reconnect");
ok(new errors.RenderedVideoMissingError("abcdef1234").message.includes("abcdef12"),
   "the missing-render error names the run");
ok(!new errors.RenderedVideoMissingError("abcdef1234").message.includes("abcdef1234"),
   "...truncated, so a full run id is not splashed into user-facing text");
ok(new errors.OAuthNotConfiguredError().message.includes("GOOGLE_OAUTH_CLIENT_ID"),
   "the not-configured error names the exact env var an owner must set");

/* ================= pagination ================= */
eq(pag.parsePage(undefined), 1, "no page param -> page 1");
eq(pag.parsePage("1"), 1, "page 1");
eq(pag.parsePage("7"), 7, "page 7");
eq(pag.parsePage("0"), 1, "page 0 is clamped to 1");
eq(pag.parsePage("-5"), 1, "a negative page is clamped to 1");
eq(pag.parsePage("abc"), 1, "a non-numeric page falls back to 1");
eq(pag.parsePage("999999999"), 10_000, "an absurd page is capped (no unbounded offset scan)");
eq(pag.parsePage("1; drop table jobs"), 1, "an injection-shaped page value is neutralised");

console.log(`\nGo-live unit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
