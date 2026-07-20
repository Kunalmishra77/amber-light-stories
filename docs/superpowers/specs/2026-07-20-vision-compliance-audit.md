# Vision-Compliance Audit & Migration Strategy

**Date:** 2026-07-20 · **Authority:** measured against `docs/PRODUCT-VISION.md` (the Source of Truth) · **No code changed — audit + plan only.**
**Method:** verified against live DB, route map, `src/lib/auth.ts`, and code greps (hardcoded IDs, brand leakage, provider hardcoding). Companion to the full PAD (`2026-07-20-product-architecture-document.md`).

**Verdict:** the foundations are strongly vision-aligned (RLS multi-tenancy, RBAC, config-driven cost engine, platform/tenant branding split, encrypted Vault). But there are **6 blocking violations** — one true isolation breach, brand leaks in platform code, and the fact that the product's *core promise* (automated content lifecycle) is not yet executable end-to-end. These must be aligned **before Part 2**.

---

## A. Architecture violations

| # | Violation | Vision principle broken | Sev | Fix |
|---|---|---|---|---|
| A1 | **Two systems share one shell.** `/admin` (platform) and client workspace render in the same `(dashboard)` layout; super-admins see both at once. | §4 "two systems must stay completely separate… never share UI/settings/permissions" | **Critical** | Separate the surfaces: a platform-console shell for `/admin/*` (platform brand only) and a tenant shell for the workspace. Super-admin with no active tenant → land on `/admin`, never a client dashboard. |
| A2 | **Control plane ↔ generation engine disconnected.** The web app never invokes `pipeline/*`; `/generate` is a mock stage-advance. The core promise (Research→…→Publish) is not executable from the product. | §3 "buying an automated business system", §9 core goal, §10 modes | **Critical** | Build the job runner/bridge (queue+worker or Modal) the dashboard triggers; execute real stages using **per-tenant** keys; keep paid calls gated until approval. |
| A3 | **No automation runner.** `schedules` is config-only; nothing executes cadence. Automatic Mode cannot actually run. | §10 Automatic Mode, §9 Scheduling/Publishing | **High** | A scheduler service reading `schedules` → enqueue generation/publish per tenant timezone; honor pause/holiday/emergency-stop. |
| A4 | **Legacy v1 code coexists** (`ai/`, `media/`, `worker/`, `app/` long-form pipeline) alongside `pipeline/`. Duplicate/again-superseded logic. | §19 "avoid duplicate logic", "reusable modules" | Medium | Archive/remove v1; single canonical engine = `pipeline/`. |

## B. SaaS-model violations

| # | Violation | Principle | Sev | Fix |
|---|---|---|---|---|
| B1 | **Publishing/analytics are single-account, not per-tenant.** One Google OAuth token + one channel (`UC741-…`) live in `.env`; `apis/*` (v1) use it globally. `channels`/`tenant_credentials` exist but are unused by publishing. | §5 "own YouTube channels", §13 config-over-customization, §17 multiple providers | **Critical** | Wire publish/analytics to per-tenant `channels` + Vault OAuth. Each client publishes to *their* channel with *their* token. Remove the global `.env` publishing path. |
| B2 | **Generation reads keys from `.env`, not per-tenant Vault.** The Python engine would use the platform's OpenAI/fal/ElevenLabs keys for everyone. | §5 "own API credentials", §16 encryption, §14/§15 cost per tenant | **Critical** | Engine resolves each tenant's keys via `get_credential` (Vault). Per-tenant cost accounting. |
| B3 | **Content planner is a deterministic mock**, not research-based AI (industry/country/competitors/trends). | §9 Research/Strategy, §3 "think for the client" | High | Real planner: single structured AI call from `tenant_settings`, still cost-governed; keep mock as offline/dev fallback. |
| B4 | **Billing has no processor / entitlement enforcement.** Plans/subscriptions/credits are schema+UI only; limits aren't enforced. | §8 business model | High | Stripe + quota/entitlement checks gating generation by plan. |

## C. Tenant-isolation violations

| # | Violation | Principle | Sev | Fix |
|---|---|---|---|---|
| C1 | **Super-admin is a `client_owner` member of the Amber Light tenant** (verified in DB). Platform operator is entangled with a client identity → sees a client workspace. | §4 separation, §5 isolation, §7 hierarchy | **Critical** | Remove super-admin's client memberships. Super-admin is a **platform role only**. To view a client, use **audited impersonation** ("View as tenant"), never standing membership. |
| C2 | **Storage bucket `assets` is public-read.** Any asset URL is guessable/enumerable across tenants. | §5 storage isolation, §16 no cross-tenant leakage | High | Make bucket private; serve via short-lived **signed URLs**; enforce tenant path + policy. |
| C3 | **Leaked dev credentials still in use** (OpenAI/Gemini/Supabase/ElevenLabs/fal/Google in `.env`, shared in chat). | §16 security from day one | High (pre-production) | Rotate all; move platform secrets to Vault/Vercel/Modal secrets; never in code. |

*(Data-layer isolation itself — RLS on all 48 tables — is correct and vision-aligned.)*

## D. Branding inconsistencies (client brand leaking into platform code)

| # | Location | Leak | Sev | Fix |
|---|---|---|---|---|
| D1 | `admin/page.tsx:150` | Super-Admin overview: "Cross-tenant administration for **Amber Light Stories**." | High | Use platform name from `platform_settings` ("YT-Automation"). |
| D2 | `admin/onboarding/actions.ts:109` | Approval notification body: "welcome to **Amber Light Stories**" — sent for *every* new tenant. | High | Use the **approved tenant's** brand (per-row), not a hardcoded first client. |
| D3 | `onboarding/[token]/waiting/waiting-poller.tsx:57` | Platform onboarding page: "contact your **Amber Light Stories** contact." | High | Use platform name / generic support contact. |
| D4 | `lib/pipeline/stage-content.ts:177-180` | Mock SEO title/description hardcode "Amber Light Stories". | Medium | Derive from the run's tenant brand. |
| D5 | `brand/brand-form.tsx:129` (client page placeholder) | Example text "e.g. Amber Light Stories". | Low | Generic placeholder ("e.g. your brand name"). |

*Good:* **no hardcoded tenant/project/user UUIDs found in `web/src`.* Platform vs tenant branding split (P6.1) is otherwise correct.

## E. Project-specific / hardcoding to make reusable

| # | Item | Principle | Fix |
|---|---|---|---|
| E1 | Publishing tied to one channel/token (B1) | §13, §19 no hardcoded providers/IDs | Provider-abstracted, per-tenant channels. |
| E2 | AI providers/models referenced in `pipeline/executors.py` + `model_routing.py` defaults | §13 config, §14 provider-agnostic | Keep DB-driven `settings.model_routing` as the only source; defaults are fallback only; add a provider-adapter interface so fal→Replicate/self-host is a config swap (partially done). |
| E3 | Mock generators (planner, stage-content) embed sample brand/topics | §19 reusable | Parameterize by tenant; move samples to fixtures. |
| E4 | Single storage provider assumption | §17 multiple storage providers | Storage adapter interface (Supabase→R2) for future. |
| E5 | Stale/incorrect code comments (`auth.ts:141` says role_permissions empty — it has 68 rows) | correctness | Update; verify RBAC path uses the seeded matrix. |

---

## Migration strategy — align to the vision BEFORE Part 2

Ordered by dependency; each step is a discrete, reviewable change. **All $0** (no paid generation; that stays frozen).

**M1 — Platform/tenant separation & isolation (fixes A1, C1, D1–D3).**
- Remove super-admin's `memberships` in client tenants (data change).
- Routing: `is_super_admin` (not impersonating) → `/admin`; never render a client workspace for a platform operator.
- Give `/admin/*` its own platform-branded shell; scrub client-brand strings from platform code → read `platform_settings`.
- Add **audited impersonation** ("View as tenant") as the only way a super-admin enters a workspace.
- *Outcome:* the two systems are truly separate; "Amber Light in Super Admin" is gone by design.

**M2 — Security & storage hardening (fixes C2, C3).**
- Rotate all leaked credentials; move platform secrets to Vault/secret stores.
- Make `assets` bucket private + signed URLs + tenant-scoped policies.

**M3 — Per-tenant credential & channel wiring (fixes B1, B2, E1).**
- Generation engine + publishing resolve **per-tenant** keys via Vault and **per-tenant** `channels` OAuth.
- Retire the global `.env` publishing path.

**M4 — Close the generation loop (fixes A2).**
- Stand up the job runner/bridge; the dashboard's Manual/Automatic pipeline triggers real `pipeline/*` stages per tenant; paid stages remain gated behind explicit approval.

**M5 — Automation runner (fixes A3).**
- Scheduler service over `schedules` → enqueue per-tenant, timezone-correct; honor pause/holiday/emergency-stop.

**M6 — Real AI planner + commercial (fixes B3, B4).**
- Research-based planner from `tenant_settings`; Stripe billing + plan entitlement/quota enforcement.

**M7 — Cleanup & correctness (fixes A4, D4–D5, E2–E5).**
- Remove v1 legacy; parameterize mocks; provider/storage adapter interfaces; fix stale comments/lint.

**Sequencing rule:** M1 → M2 → M3 must land before any new client-facing feature, because they establish separation, security, and per-tenant credentials — the preconditions every Part-2 feature depends on. M4–M5 make the product actually *do* its job; M6–M7 make it commercial and clean.

**Keep unchanged (already vision-aligned):** RLS tenancy model, RBAC schema + seeded permissions, cost-optimization engine (decision/cache/reuse/local-FFmpeg), review state machine, onboarding wizard, platform/tenant branding split, Phase-6 auth hardening, theme engine.
