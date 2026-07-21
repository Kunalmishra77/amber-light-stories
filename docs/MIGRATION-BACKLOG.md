# Migration Backlog — OFFICIAL

**Status: LIVING DOCUMENT.** This is the authoritative backlog of every architecture issue that must be resolved to align the current **prototype** with `PRODUCT-VISION.md` (the Source of Truth). Do not discard. Every issue stays linked to a migration task (M1–M7). **When future Product Bible parts introduce new requirements, add/adjust items here.**

**Rules:**
- No implementation begins until the Product Bible is sufficiently complete (owner's call). See `PRODUCT-BIBLE-INDEX.md`.
- The current codebase is a **prototype** to be migrated — do not prematurely optimize it.
- Sequencing rule: **M1 → M2 → M3 must land before any new client-facing feature.**
- Sources: `2026-07-20-vision-compliance-audit.md` (V) + `2026-07-20-product-architecture-document.md` (PAD). Future parts append new sources.

## Migration tasks (epics)
| Task | Theme | Gates |
|---|---|---|
| **M1** | Platform/tenant separation & isolation | ✅ **COMPLETE (2026-07-20)** — was: must precede all client features |
| **M2** | Security & storage hardening | ✅ **Code COMPLETE (2026-07-20)** — ISS-C2 done; ISS-C3 store verified, credential rotation is an owner action (runbook). Was: must precede real credentials/publishing |
| **M3** | Per-tenant credentials & channels | ✅ **Code COMPLETE (2026-07-20)** — provider-abstracted per-tenant credential (Vault) + publishing-target (channels) resolution seam; consumed by M4. Was: must precede generation/publish loop |
| **M4** | Close the generation loop (dashboard ↔ engine) | ✅ **Code COMPLETE (dry-run) (2026-07-20)** — web invokes the real generation engine via the M3 provider/credential seam; paid execution is a gated extension point. Was: core product function |
| **M5** | Automation runner (scheduler executes) | ✅ **Done (2026-07-20)** — cron runner executes cadence; Automatic Mode active (needs CRON_SECRET). Was: Automatic Mode |
| **M6** | Real AI planner + commercial (billing/entitlements) | ✅ **Entitlement enforcement + planner seam done (2026-07-20)**; payment processor (Stripe) deferred to M9. Was: monetization |
| **M7** | Cleanup, adapters, correctness | **done** (legacy v1 removed; single execution path; correctness fixes shipped — adapter interfaces ISS-E2/E3/E4 reassigned to the M11 engine) |
| **M8** | Platform Console completeness (Super Admin target from Part 2) | platform ops — **in progress**, delivered incrementally. Done: Operations core (Queue/Job Manager ISS-P2-05, Reports/Exports ISS-P2-10), Public API & Webhooks (ISS-P2-12), AI Gateway (ISS-P2-06); prior: registry (M3), quota (M6), impersonation hook (M1), shells (P2-15). Remaining console modules (P2-07/08/09/13/14/17 + R1-01…10) tracked below as their own increments. |
| **M9** | Commercial / Billing (Stripe, invoicing, dunning, tax) | monetization |
| **M10** | Client Workspace Experience (Part 3 target) | client-facing product — **v1.0 focus** (owner pivot 2026-07-21: ship the 7-step customer loop first, postpone enterprise/governance/compliance/marketplace/white-label/localization). Done: **Publish execution** (ISS-P3-12, step 6 — dry + gated-live YouTube adapter, wired into publish-stage approval); **Analytics ingestion** (ISS-P3-05, step 7 — provider-abstracted adapter + idempotent ingestion + rollup + cron + wired /analytics). **All 7 v1.0 loop steps functional** (steps 3/6 real-data paths gated on the paid-render freeze; dry paths exercisable end-to-end). M9 billing postponed (not a loop step). |
| **M11** | Automation Engine — durable workflow/job runtime (Part 5 target) | core reliability/scale; absorbs M4/M5 — **in progress**. **M11-1 done (2026-07-21):** Durable Job Engine core (ISS-P5-02; foundations of P5-03, P5-11) — migration 016 evolved `jobs` into a leased, idempotent, tenant-scoped queue + `claim_jobs`/`reap_stale_jobs` (FOR UPDATE SKIP LOCKED) + `lib/jobs/` engine/runner + process-jobs cron + real `analytics.ingest` handler. **M11-2 done (2026-07-21):** Scheduler → durable job integration (ISS-P5-04) — `schedule.generate` job type + handler; `runDueSchedules` enqueues instead of executing inline; deterministic per-(tenant, local-day, run-slot) idempotency. Remaining M11 increments (one at a time): P5-10 tenant-fair partitioning/caps, P5-01 DAG, P5-07/09 recovery+breakers, P5-12/R1 observability & Worker Center, ADR-034 misfire/simulation policy. |
| **M12** | AI Generation Pipeline — content intelligence (Part 6 target) | runs on M11; quality/prompt/character/style/memory |
| **M13** | Enterprise Security — identity, authN/authZ, Vault, audit, compliance (Part 7 target) | cross-cutting; hardens M1/M2/M8 |
| **M14** | Backend Architecture — domains, events, APIs, storage, search, cache, observability, governance (Part 9 target) | foundational; underpins M8–M13 |
| **M15** | Operations & Human-in-the-Loop — modes, review, operations, collaboration (Part 10 target) | runs on M11/M14/M13 |
| **M16** | Enterprise Platform & Ecosystem — white-label, agency, marketplace, partners, developer platform, plugins, integrations, governance (Part 11 target) | last layer; composes M8–M15 |
| **M17** | Product Governance & Long-Term Evolution (Part 12 target) | process/governance, not features; ongoing |

## Backlog items
| ID | Issue | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-A1 | Platform (`/admin`) and client workspace share one shell; super-admin sees both | Critical | M1 | **Done (code, 15b3ee9)** — /admin moved to `(platform)` route group w/ its own platform shell; client sidebar no longer renders admin nav | V/A1 |
| ISS-C1 | Super-admin is a `client_owner` **member** of the Amber Light tenant (isolation breach) | Critical | M1 | **Done (4ea2b78 + migration 011 executed)** — operator now holds 0 memberships; enters workspaces only via audited impersonation; RLS/isolation/super-admin verified | V/C1 |
| ISS-D1 | `admin/page.tsx:150` hardcodes client brand ("Amber Light Stories") on a platform page | High | M1 | **Done (code, 15b3ee9)** — uses resolved platform brand | V/D1 |
| ISS-D2 | `admin/onboarding/actions.ts:109` onboarding email hardcodes first client's brand for all tenants | High | M1 | **Done (code, 15b3ee9)** — welcomes client to their own business name | V/D2 |
| ISS-D3 | `onboarding/[token]/waiting/waiting-poller.tsx:57` platform waiting page hardcodes client brand | High | M1 | **Done (code, 15b3ee9)** — neutral platform-hosted message | V/D3 |
| ISS-C2 | `assets` storage bucket is public-read (cross-tenant enumeration) | High | M2 | **Done (0311e87 + migration 012 applied & verified)** — bucket PRIVATE; signed URLs; public 400 / signed 200 | V/C2 |
| ISS-C3 | Leaked dev credentials still in use (rotate; move to secret stores) | High | M2 | **Store done + verified** — `.env` gitignored & never committed; tenant secrets in Vault; **rotation = owner action** per `docs/security/credential-rotation-runbook.md` | V/C3 |
| ISS-B1 | Publishing/analytics use one global `.env` YouTube channel/token, not per-tenant `channels` | Critical | M3 | **Product-layer done** — provider-abstracted `getPublishingTarget`/`listPublishingTargets` resolve the tenant's own `channels` (per-tenant, RLS-isolated); youtube page wired. Engine execution wires in M4. Global-`.env` channel is legacy v1 Python only (M7/ISS-A4). | V/B1 |
| ISS-B2 | Generation engine reads platform `.env` keys, not per-tenant Vault (`get_credential`) | Critical | M3 | **Seam done** — `getTenantCredential(tenant, provider)` reads the per-tenant Vault (`get_credential`, service-role-only; client-read denied — verified). The M4 loop consumes this; no product code reads global `.env` keys. Legacy Python global keys = M7/ISS-A4. | V/B2 |
| ISS-E1 | Publishing tied to single provider/channel (needs provider-abstracted, per-tenant) | High | M3 | **Done** — `lib/providers/publishing.ts` models a provider-keyed `PublishingTarget` (`PublishingProvider` union) resolved per-tenant; new platforms = new provider + adapter, no resolver change (ADR-015). | V/E1 |
| ISS-A2 | Web app never invokes `pipeline/*`; `/generate` is a mock — core lifecycle not executable | Critical | M4 | **Loop closed (dry) — done** — `/generate` now invokes `lib/pipeline/generation.ts` (`runStoryGeneration`), which resolves the LLM provider + per-tenant credential via the M3 registry/Vault seam and executes the pipeline lifecycle (stories/scenes/pipeline_runs/pipeline_stages → reviewable at /pipeline). **Dry ($0) by default**; **live (paid)** is a gated extension point (`LiveGenerationDisabledError`) pending owner authorization (Part 1). Real per-stage provider adapters (image/voice/render) = deferred, plug into the same seam. | V/A2 |
| ISS-A3 | `schedules` is config-only; no runner executes cadence (Automatic Mode inert) | High | M5 | **Done (3ac858a)** — `lib/schedule/runner.ts` + secured `/api/cron/run-schedules` route + hourly `vercel.json` cron execute each due tenant's cadence (timezone/days/times/pause/holiday/emergency-stop, idempotent per-day) in dry mode via the M4 engine. Needs `CRON_SECRET` set in Vercel to activate. | V/A3 |
| ISS-B3 | 30-day planner is a deterministic mock, not research-based AI | High | M6 | **Seam done (32c64d8)** — planner resolves the LLM provider via the M3 seam + records it; dry deterministic plan retained, live (paid) AI research is the gated extension point (mirrors generation). Real paid research = owner-gated. | V/B3 |
| ISS-B4 | Billing has no processor / entitlement + quota enforcement | High | M6 | **Enforcement done (32c64d8)** — `lib/ops/entitlements.ts` enforces `plan.limits.videos_month` server-side inside `runStoryGeneration` (both /generate + scheduler). **Payment processor (Stripe) = M9 / ISS-P2-04.** | V/B4 |
| ISS-A4 | Legacy v1 code (`ai/`, `media/`, `worker/`, `app/`) coexists with `pipeline/` | Medium | M7 | **Legacy path removed** — deleted the Celery v1 execution path (`worker/`) + FastAPI legacy API (`app/main.py`, `app/routers/`) + legacy Docker/compose + their 4 tests; pruned FastAPI/uvicorn/Celery from `pyproject.toml`. `ai/`, `media/`, and `app/{config,supabase_client,state,usage}` are **retained deliberately**: they are the shared foundation the v3 `pipeline/` engine actively imports (verified no residual references to the removed modules). Web execution path is single (M4 `generation.ts`). | V/A4 |
| ISS-D4 | `lib/pipeline/stage-content.ts:177-180` mock SEO hardcodes client brand | Medium | M7 | **Done** — `seoFallback` now takes `brandName` (resolved via `getTenantBrand`, falls back to "your channel"); no hardcoded client name. | V/D4 |
| ISS-D5 | `brand/brand-form.tsx:129` placeholder uses client brand example | Low | M7 | **Done** — placeholder is generic ("e.g. your brand name"). | V/D5 |
| ISS-E2 | AI provider/model defaults in `executors.py`/`model_routing.py` — enforce DB-driven routing + adapter interface | Medium | M11 | Open — belongs to the deferred v3 engine (M11); adapter interface lands with live execution. | V/E2 |
| ISS-E3 | Mock generators embed sample brand/topics — parameterize by tenant/fixtures | Medium | M11 | Open — web mock SEO already parameterized (ISS-D4); remaining Python fixture parameterization is engine-side (M11). | V/E3 |
| ISS-E4 | Single storage-provider assumption — add storage adapter interface | Low | M11 | Open — storage adapter is engine-side (M11). | V/E4 |
| ISS-E5 | Stale comment (`auth.ts:141` claims role_permissions empty; it has 68 rows); `workers/page.tsx` `Date.now()` lint | Low | M7 | **Done** — comment corrected (role check is a coarse ownership gate; fine-grained via seeded `role_permissions`); `Date.now()` fallback removed (timestamp rendered only when `updated_at` present). | V/E5, PAD |

## Part-2 additions (from `product-bible/PART-2-platform-and-super-admin.md`)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P2-01 | No **impersonation console** (audited, time-boxed) — the required way for Super Admin to enter a client workspace (pairs with ISS-C1) | Critical | M1/M8 | **M1 hook Done (4ea2b78)** — minimal audited "View as Workspace" (cookie + audit_log + banner + exit). Full time-boxed console = **M8** (extends this seam, no refactor) | P2 §5,§10 |
| ISS-P2-02 | No **entitlements/quota engine** enforcing plan limits (videos/credits/seats/storage) server-side | Critical | M8/M9 | Open | P2 §7 |
| ISS-P2-03 | No **AI Providers Registry** / **Publishing Providers Registry** (provider-adapter pattern; keys in secrets) | Critical | M3/M8 | Open | P2 §2.2 |
| ISS-P2-04 | No **Payments/Stripe**, invoicing, dunning, tax, coupons | High | M9 | Open | P2 §7 |
| ISS-P2-05 | No **Queue/Job Manager** (inspect/retry/cancel/DLQ) | High | M4/M8 | **Done** — `/admin/queue` cross-tenant run manager: filterable list (all/active/dead-letter/closed) + stat cards, `/admin/queue/[id]` inspect (run meta + per-stage status/model/cost/attempts/last_error), retry (failed→re-open into review loop, resets failed stages + bumps attempts) + cancel (non-terminal→cancelled, skips open stages), super-admin-gated + audited. DLQ = failed-runs view. | P2 §2.3,§9 |
| ISS-P2-06 | No **AI Gateway console** (central routing/cost/fallback/rate-limit) | High | M4/M8 | **Done** — unified `lib/ai-gateway/` over the existing registry + tenant-credential seam: capability discovery (registry `capabilities`), central `selectProvider` (failover-ordered, credential-aware — `resolveGenerationProvider` now delegates to it, one routing path), retry/timeout/backoff policy engine, provider-independent `AIProviderAdapter` (dry-run built-in; live = gated `LiveGenerationDisabledError` extension point), health hooks (`provider_health`, migration 014) + cost hooks (reuse `api_usage`), `runThroughGateway` execution with failover. Console `/admin/gateway` (providers × capabilities × health × cost). No provider-specific business logic. | P2 §9 |
| ISS-P2-07 | No **Compliance/Data-Governance** center (GDPR export/delete, residency, retention, DPA) | High | M8 | Open | P2 §2.4 |
| ISS-P2-08 | No **Backups/DR** module + restore runbook | High | M8 | Open | P2 §2.4 |
| ISS-P2-09 | No **Security Center** (posture, password policy enforce, 2FA enforce, session/device mgmt, anomaly) | High | M8 | Open | P2 §2.4 |
| ISS-P2-10 | No **Reports/Exports**; analytics not rollup-backed (scalability) | Medium | M8 | **Done (exports)** — `/admin/reports` + `/admin/reports/export` route handler: CSV export of runs, per-tenant usage/cost rollup, and tenants (RFC-4180 quoting, CRLF; super-admin-gated + audited). Rollup-backed analytics tables remain future work (tracked here). | P2 §8 |
| ISS-P2-11 | No **Onboarding-Template manager** (configurable wizard steps/required APIs) | Medium | M8 | Open | P2 §6 |
| ISS-P2-12 | No **Public API & Webhooks** / event bus | Medium | M8 | **Done** — versioned public API (`/api/v1/ping`, `/api/v1/stories`) authenticated by scoped, hashed API keys (issue/rotate/revoke) + per-key rate-limit hook + request log; signed webhook endpoints (HMAC-SHA256, issue-once signing secret) with fire-and-forget `dispatchEvent` + delivery log, wired to a real `story.generated` event; tenant `/developer` console + platform `/admin/api` oversight; migration 013 (api_keys/webhook_endpoints/webhook_deliveries/api_request_log, tenant-isolation RLS); audited; provider-independent (plain HTTP+HMAC). | P2 §2.5 |
| ISS-P2-13 | No **Support Center + Knowledge Base**; announcements/changelog not unified | Medium | M8 | Open | P2 §2.5 |
| ISS-P2-14 | No **Incidents/Status page**; storage manager; release management | Medium | M8 | Open | P2 §2.3-2.5 |
| ISS-P2-15 | **Platform vs tenant shells not separated** (visual/routing) — operators can confuse contexts (extends ISS-A1) | Critical | M1/M8 | **Done (code, 15b3ee9)** — two distinct shells: `(platform)` console vs `(dashboard)` workspace | P2 §10, D4 |
| ISS-P2-16 | Duplicate/split responsibilities to reconcile: usage (`/admin/usage` vs `/usage`), global-vs-tenant routing, announcements vs changelog | Low | M7/M8 | Open | P2 validation |
| ISS-P2-17 | Localization/tax/currency + system-defaults not configurable platform-wide | Medium | M8 | Open | P2 §2.2 |

## Part-2 Revision 1 additions (10 enterprise capabilities — `product-bible/PART-2-…` §11, ADR-005…009)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P2-R1-01 | No **AI Assistant** (read-only, RAG-grounded operator copilot; proposes, never mutates — ADR-008) | Medium | M8 | Open | P2R1 §11.1 |
| ISS-P2-R1-02 | No **Cost Simulator** (model/plan/volume what-if against margins) | Medium | M8/M9 | Open | P2R1 §11.2 |
| ISS-P2-R1-03 | No **Feature Release Center** (staged/percentage rollout, versioning, rollback — supersedes raw flags, ADR-009) | High | M8 | Open | P2R1 §11.3 |
| ISS-P2-R1-04 | No **AI Observability** (per-model latency/error/cost/quality, drift) | High | M8 | Open | P2R1 §11.4 |
| ISS-P2-R1-05 | No **Platform Health Center** (SLOs, dependency status, synthetic checks) | High | M8 | Open | P2R1 §11.5 |
| ISS-P2-R1-06 | No **Prompt Governance** (versioned prompt registry, approval, rollback, per-tier binding) | High | M8 | Open | P2R1 §11.6 |
| ISS-P2-R1-07 | No **Global Asset Library** (platform masters + copy-on-use adoption — ADR-006) | Medium | M8 | Open | P2R1 §11.7 |
| ISS-P2-R1-08 | No **Experiment Center** (A/B on models/prompts/routing with cost+quality readout) | Medium | M8 | Open | P2R1 §11.8 |
| ISS-P2-R1-09 | No **Capacity Forecasting** (usage/credit/cost projection, seasonality, alerts) | Medium | M8/M9 | Open | P2R1 §11.9 |
| ISS-P2-R1-10 | No **AI Recommendation Engine** (surfaces cost/quality/ops actions for operator confirm) | Medium | M8 | Open | P2R1 §11.10 |

## Part-3 additions (Client Experience & Workspace — `product-bible/PART-3-client-experience-and-workspace.md`)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P3-01 | No full **Workspace Profile** (~40-field, versioned, drives all automation defaults; kills hardcoding) — setup is onboarding-only | High | M10 | Open | P3 §3, ADR-012 |
| ISS-P3-02 | No **product tour / resumable setup / progress tracker** (premium first-run) | Medium | M10 | Open | P3 §2 |
| ISS-P3-03 | No **per-stage manual/auto policy matrix** (only coarse auto-approve); paid-stage safety gate | High | M10/M4 | Open | P3 §8, ADR-013 |
| ISS-P3-04 | No **Workspace AI Assistant** (tenant-scoped, read-only, propose-only) | Medium | M10 | Open | P3 §10, ADR-014 |
| ISS-P3-05 | No **real analytics ingestion** (YouTube Analytics adapter + rollups); dashboards are placeholders | High | M10/M8 | **Done (v1.0 loop step 7)** — provider-abstracted analytics domain (`lib/analytics/`): adapter interface + YouTube adapter (dry deterministic fixtures / live real YouTube Analytics v2 API via Vault credential, gated), idempotent `ingestTenantAnalytics` (one row per video+day), pure `rollup`. Storage: `analytics` extended (migration 015 — tenant_id + RLS tenant_isolation, period_date, provider/external id, extra metrics, `source` live|dry, partial-unique idempotency index). Daily cron `/api/cron/ingest-analytics` (CRON_SECRET) + on-demand refresh action. `/analytics` rewritten with real tenant-scoped rollup + per-video table; sample/live provenance clearly labeled (never faked as real). | P3 §12 |
| ISS-P3-06 | Missing creative libraries: **Music Library, Scene Library, Thumbnail Center** as first-class modules | Medium | M10 | Open | P3 §9 |
| ISS-P3-07 | Planning depth missing: **content versions, revision history, templates, bulk/recurring/seasonal** | Medium | M10 | Open | P3 §6 |
| ISS-P3-08 | **Notification completeness**: API-expiry/subscription/security categories + per-user channel prefs (one event-driven service) | Medium | M10 | Open | P3 §11, ADR-016 |
| ISS-P3-09 | Full **RBAC role set** (Manager/Editor/Reviewer/Publisher/Viewer + custom) beyond seeded basics | Medium | M10 | Open | P3 §15.7 |
| ISS-P3-10 | No unified **Workspace/AI/API/Publishing health** aggregation surface | Medium | M10 | Open | P3 §5 |
| ISS-P3-11 | No in-workspace **Help system**: Knowledge Base, Support Center, Feedback, Feature Requests | Low | M10 | Open | P3 §9 |
| ISS-P3-12 | No **multi-channel/publishing-target abstraction** (destinations generic; YouTube = first adapter) — overlaps ISS-B1/E1 | Medium | M10/M3 | **Publish execution done (v1.0 loop step 6)** — `lib/publishing/publish.ts` `publishRun` resolves the tenant's own channel (M3 resolver) + credential (Vault), routes through a provider-independent publish adapter, records an idempotent `videos` publication (`idempotency_key=publish:<run>`). Dry = simulated ($0, real DB state); live = gated YouTube-upload extension point (`LivePublishDisabledError`). Wired into the terminal publish-stage approval (`approveStage`); published videos surface on `/publishing`. Emits `video.published` webhook. | P3 §14, ADR-015 |

## Part-3 Revision 1 additions (11 enhancements — `product-bible/PART-3-…` §19, ADR-017…020)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P3-R1-01 | No **Live Automation Timeline** (real-time stage/provider/model/cost/ETA, openable stages) | High | M10/M4 | Open | P3R1 §19.1, ADR-017 |
| ISS-P3-R1-02 | No **per-video AI Cost Breakdown** (by provider/stage, estimate vs actual, tokens/render/voice/image/animation) | High | M10 | Open | P3R1 §19.2, ADR-020 |
| ISS-P3-R1-03 | No **Automation Sandbox** (test/dry/preview/partial/provider-test/publishing-sim; no prod side effects) | High | M10 | Open | P3R1 §19.3, ADR-019 |
| ISS-P3-R1-04 | No **AI Quality Score** (overall + script/visual/voice/animation/subtitle/SEO/thumbnail/readiness; explainable, pluggable evaluators) | Medium | M10 | Open | P3R1 §19.4, ADR-018 |
| ISS-P3-R1-05 | No **Workspace Readiness Score** (brand/API/automation/publishing/notif/billing/security/storage/integrations + recommendations) | Medium | M10 | Open | P3R1 §19.5, ADR-018 |
| ISS-P3-R1-06 | No **AI Credit & Cost Estimator** (daily/weekly/monthly, per-video/short/long, credits/storage/render-time; optimize-before-run) | High | M10/M9 | Open | P3R1 §19.6, ADR-020 |
| ISS-P3-R1-07 | No **Workspace Templates** (Story/History/Kids/Finance/… auto-configure brand/workflow/prompts/publishing/models/rules) | Medium | M10 | Open | P3R1 §19.7, ADR-006/012 |
| ISS-P3-R1-08 | No **AI Learning Center** (prompt/SEO/storytelling/thumbnail/automation/cost/publishing/model/workflow lessons) | Low | M10 | Open | P3R1 §19.8 |
| ISS-P3-R1-09 | No **Workspace Success Checklist** (created→brand→APIs→YouTube→plan→automation→published→analytics→stable→100%) | Low | M10 | Open | P3R1 §19.9 |
| ISS-P3-R1-10 | No **Business Insights Engine** (best time/duration/provider/thumbnail, CTR/SEO/cost/growth/automation/trend recs; propose-only) | Medium | M10/M8 | Open | P3R1 §19.10, ADR-014 |
| ISS-P3-R1-11 | **Workflow-Driven Architecture** not realized: modules must be views/controllers over uniform Jobs (queued→running→…→retry) | Critical | M10/M4 | Open | P3R1 §19.11, ADR-017 |

## Part-4 additions (Client Onboarding, Setup Wizard & API Activation — `product-bible/PART-4-…`, ADR-021…024)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P4-01 | No **stateful, resumable onboarding engine** (server-persisted step state, resume, abandonment re-entry) | High | M10/M1 | Open | P4 §3, ADR-021 |
| ISS-P4-02 | No **Interactive Setup Assistant** (ETA, autosave, AI prefill, best-practice, live mistake detection) | High | M10 | Open | P4 §3 |
| ISS-P4-03 | No **continuous Validation Engine** (declarative, severity-tiered, capability-coverage submit gate) | High | M10 | Open | P4 §9, ADR-022 |
| ISS-P4-04 | No **error-recovery/idempotency layer** (crash-safe autosave, per-scenario retry/rollback) | High | M10 | Open | P4 §10, ADR-023 |
| ISS-P4-05 | No **API Activation Center** (acquisition guides, permission/scope + quota + estimated-cost + rotation/replacement) | High | M10/M3 | Open | P4 §8 |
| ISS-P4-06 | **YouTube channel setup depth** missing (placeholder mode, scope check, brand account, playlist strategy, multi-channel-ready) | Medium | M10/M3 | Open | P4 §7, ADR-015 |
| ISS-P4-07 | **Subscription activation states** (trial/paid/enterprise/grace/pending) not woven into onboarding | High | M10/M9 | Open | P4 §11 |
| ISS-P4-08 | No **onboarding-gate Readiness Engine** (dimensioned, threshold-gated submit) — extends P3 readiness | Medium | M10 | Open | P4 §12 |
| ISS-P4-09 | No **first-automation guided "aha" flow** (sandbox-first, single confirmed publish, celebrate) | Medium | M10/M4 | Open | P4 §13, ADR-024 |
| ISS-P4-10 | No **onboarding analytics funnel** (completion/drop-off/most-failed/approval-time/time-to-value) | Medium | M10/M8 | Open | P4 §16 |
| ISS-P4-11 | No **onboarding help system** (contextual guides, ticket-with-context, tutorials) | Low | M10 | Open | P4 §14 |
| ISS-P4-12 | No **email verification + consent/rights capture** as first-class onboarding steps | Medium | M10/M1 | Open | P4 §2,§5 |

## Part-4 Revision 1 additions (14 onboarding enhancements — `product-bible/PART-4-…` §20, ADR-025…029)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P4-R1-01 | No **Client Onboarding Dashboard** (pre-activation control center: progress/readiness/API/subscription/approval/notifications/resume/restart/support) | High | M10 | Open | P4R1 §20.1 |
| ISS-P4-R1-02 | No **Dynamic Setup Wizard** (steps computed from plan/country/language/content/category/providers/platform/mode/expertise) | High | M10 | Open | P4R1 §20.2, ADR-025 |
| ISS-P4-R1-03 | No **Beginner/Advanced modes** (guidance density + bulk/import shortcuts) | Medium | M10 | Open | P4R1 §20.3 |
| ISS-P4-R1-04 | No **Import & Clone** (workspace/config/brand-kit/prompts/rules/templates; cross-platform migration) | Medium | M10 | Open | P4R1 §20.4, ADR-028 |
| ISS-P4-R1-05 | No **API Health Center** (permanent: health/status/quota/expiry/credits/latency/last+next validation/rotation/history/recs) | High | M10/M3 | Open | P4R1 §20.5 |
| ISS-P4-R1-06 | No **Brand Consistency Check** (completeness score across logo/colors/type/voice/thumb/CTA/intro/outro/watermark) | Low | M10 | Open | P4R1 §20.6, ADR-018 |
| ISS-P4-R1-07 | No **Onboarding AI Assistant** (dedicated, propose-only: API sourcing/plan/cost/skip guidance) | Medium | M10 | Open | P4R1 §20.7, ADR-014 |
| ISS-P4-R1-08 | No **Client Readiness Certificate** at activation (providers/security/automation/publishing/score/next-steps) | Low | M10 | Open | P4R1 §20.8, ADR-029 |
| ISS-P4-R1-09 | No **Enterprise Organization support** (org/dept/BU/teams/multi-brand/multi-workspace/approval-chains/regional) future-proofing | Medium | M10/M8 | Open | P4R1 §20.9, ADR-026 |
| ISS-P4-R1-10 | No **Onboarding Audit Trail** (immutable record of every onboarding action) | Medium | M10 | Open | P4R1 §20.10, ADR-029 |
| ISS-P4-R1-11 | No **Gamification** (progress badges, setup milestones, 100%/first-automation/first-publish badges) | Low | M10 | Open | P4R1 §20.11 |
| ISS-P4-R1-12 | No **pre-activation Cost Estimation gate** (monthly/per-video cost, capacity, storage, render-time, savings, alt providers) | Medium | M10/M9 | Open | P4R1 §20.12, ADR-020 |
| ISS-P4-R1-13 | No **First-Week Success Plan** (guided 7-day post-activation plan) | Low | M10 | Open | P4R1 §20.13 |
| ISS-P4-R1-14 | No **server-enforced Workspace Activation Checklist** (single authoritative provisioning→active gate) | High | M10/M1 | Open | P4R1 §20.14, ADR-027 |

## Part-5 additions (Automation Engine — `product-bible/PART-5-automation-engine.md`, ADR-030…034)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P5-01 | No generic **Workflow/DAG engine** (seq/parallel/conditional/branch/merge/nested/versioned/template) — only a linear pipeline concept | Critical | M11/M4 | Open | P5 §4 |
| ISS-P5-02 | No **universal Job Engine** (uniform lifecycle/priority/deps/timeout/retry/idempotency/checkpoint/version/audit) | Critical | M11 | **Done (M11-1)** — durable DB-backed engine on the evolved `jobs` table (migration 016): uniform lifecycle (queued→running→succeeded / failed→queued retry→dead DLQ), priority, timeout, exponential-backoff retry, per-(tenant,key) idempotency, checkpoint, stateless-worker lease, tenant isolation (RLS). `lib/jobs/` (enqueue/claim/heartbeat/checkpoint/complete/fail/reap + handler registry + runner). Deps/DAG + versioning deferred to later M11 increments. | P5 §5, ADR-030 |
| ISS-P5-03 | No **queue + stateless workers + DLQ** infrastructure | Critical | M11 | **Foundation done (M11-1)** — atomic `claim_jobs()` (FOR UPDATE SKIP LOCKED) + stateless `processJobs` runner + `/api/cron/process-jobs` + `reap_stale_jobs()` crash recovery + dead-letter (DLQ) transition. Tenant-fair partitioning/concurrency caps (ADR-031) = later increment. | P5 §8, ADR-031; extends ISS-P2-05 |
| ISS-P5-04 | **Scheduler** is config-only — no execution/validation/simulation/misfire policy | High | M11/M5 | **Durable execution done (M11-2)** — `runDueSchedules` no longer executes inline; due schedules now ENQUEUE a durable `schedule.generate` job (M11-1 engine) which the process-jobs worker claims and runs (DRY). Deterministic idempotency key `schedule:gen:<tenant>:<localDate>:<runSlot>` + jobs unique index ⇒ repeated/concurrent cron ticks never duplicate. Due evaluation (tz/days/publish_times/pause/holiday/emergency-stop) and the daily-limit gate are unchanged; quota exhaustion stays a skip (no retry). Validation/simulation/misfire policy (ADR-034) = later increment. | P5 §6, ADR-034; extends ISS-A3 |
| ISS-P5-05 | No **event-driven Trigger router** over an event bus | High | M11 | Open | P5 §7, ADR-034; needs ISS-P2-12 |
| ISS-P5-06 | No **execution management** (history/timeline/replay/comparison/export/clone/recovery) | High | M11 | Open | P5 §8 |
| ISS-P5-07 | No **layered Failure Recovery** (checkpoint/rollback/DLQ/escalation/RCA/failure categories) | High | M11 | Open | P5 §9, ADR-030 |
| ISS-P5-08 | No **engine-level cost governor** (workspace/monthly budgets, parallel cost limits, duplicate detection) | High | M11/M6 | Open | P5 §10, ADR-032 |
| ISS-P5-09 | No **provider auto-switching / circuit breakers** (cost-bounded fallback) | Medium | M11 | Open | P5 §9, ADR-033 |
| ISS-P5-10 | No **tenant-fair queue partitioning + per-plan concurrency caps** (noisy-neighbor protection) | High | M11/M1 | Open | P5 §12, ADR-031 |
| ISS-P5-11 | No **idempotency + exactly-once side effects** on retries/publishing | High | M11 | **Foundation done (M11-1)** — exactly-once enqueue via per-(tenant, idempotency_key) unique index; the analytics.ingest handler is idempotent (one analytics row per video+day). Publishing/generation exactly-once migrate onto the engine in later increments. | P5 §5,§9, ADR-030 |
| ISS-P5-12 | No **engine-level observability** (correlation/run/tenant IDs, per-job metrics feeding P3/P2 surfaces) | Medium | M11/M8 | Open | P5 §11 |

## Part-5 Revision 1 additions (12 engine enhancements — `product-bible/PART-5-…` §17, ADR-035…039)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P5-R1-01 | No **Visual Workflow Builder** readiness (serializable versioned DAGs editable via drag-drop/zoom/pan/diff/import/export/clone/simulate) | Medium | M11 | Open | P5R1 §17.1, ADR-035 |
| ISS-P5-R1-02 | No **Automation Marketplace** (official/community/premium templates, one-click install, version-compat, ratings/updates) | Medium | M11/M8/M9 | Open | P5R1 §17.2, ADR-006/028 |
| ISS-P5-R1-03 | No **Execution Visualizer** (live DAG: active/waiting/completed/failed/retry nodes, path, cost, artifacts) | High | M11 | Open | P5R1 §17.3 |
| ISS-P5-R1-04 | No **Automation Version Control** (history/compare/rollback/restore/publish; draft/active/archived; no overwrite) | High | M11 | Open | P5R1 §17.4, ADR-036 |
| ISS-P5-R1-05 | No **Smart Queue Management** (priorities/fair-sched/saturation/autoscale-ready/metrics/viz/replay/drain/partition/health) | High | M11 | Open | P5R1 §17.5, ADR-031 |
| ISS-P5-R1-06 | No **Worker Management Center** (active/idle/failed/restart/health/capacity/current+historical jobs/logs/perf; distributed-ready) | Medium | M11/M8 | Open | P5R1 §17.6 |
| ISS-P5-R1-07 | No **Cost Governor Dashboard** (budget/spend/estimate, cost by provider/workflow/job, trends/savings/alerts/recs) | Medium | M11/M9 | Open | P5R1 §17.7, ADR-032 |
| ISS-P5-R1-08 | No **AI Decision Engine** (explainable/auditable provider/model/retry/downgrade/pause/approve/switch/cancel decisions) | High | M11 | Open | P5R1 §17.8, ADR-037 |
| ISS-P5-R1-09 | No **Execution Policies** (Cost/Speed/Quality/Balanced/Enterprise — objective function within cost cap) | Medium | M11 | Open | P5R1 §17.9, ADR-038 |
| ISS-P5-R1-10 | **Sandbox** not engine-strengthened (mock providers, test data, simulated publishing, isolated namespace, result comparison) | Medium | M11 | Open | P5R1 §17.10, ADR-019 |
| ISS-P5-R1-11 | No **Platform-Wide Automation Health Center** (engine/queue/worker/provider/workflow health, success/failure/recovery rates, avg runtime/cost) | Medium | M11/M8 | Open | P5R1 §17.11 |
| ISS-P5-R1-12 | No **Self-Healing Automation** (auto-retry/intelligent-delay/alt-provider/resource+queue+stuck-job recovery/deadlock-detect/auto-escalate before human) | High | M11 | Open | P5R1 §17.12, ADR-039 |

## Part-6 additions (AI Generation Pipeline — `product-bible/PART-6-ai-generation-pipeline.md`, ADR-040…044)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P6-01 | No **full idea→publish content pipeline** (Strategy/Trend/Competitor/Fact-Verify/Story-Enhance/Compliance/Learning stages missing or mocked) | Critical | M12/M4 | Open | P6 §2,§3 |
| ISS-P6-02 | No **Content Quality Engine** (dimensioned explainable scores, partial-regeneration, threshold gating) | High | M12 | Open | P6 §5, ADR-042 |
| ISS-P6-03 | No **enterprise Prompt Engine** (templates/vars/versioning/governance/localization/optimization/testing/simulation/cost-estimate) | High | M12/M8 | Open | P6 §6, ADR-041 |
| ISS-P6-04 | No **Character Consistency Engine** (reference-set identity, descriptors, voice binding, master-once, series continuity) | High | M12 | Open | P6 §7, ADR-041 |
| ISS-P6-05 | No **Visual Style Engine** (versioned reusable Style Packs, copy-on-use, format-independent, safety-aware) | Medium | M12 | Open | P6 §8, ADR-041 |
| ISS-P6-06 | No **content-generation Decision Engine** (model-tiering, regeneration-scope, provider-switch, approval — explainable) | High | M12 | Open | P6 §9, ADR-037 |
| ISS-P6-07 | No **Content Memory** (tenant-isolated structured+semantic learning store; dedupe/reuse/steer) | High | M12 | Open | P6 §10, ADR-043 |
| ISS-P6-08 | No **Fact Verification + Compliance/Safety** stages (accuracy + policy/brand-safety gating) | High | M12 | Open | P6 §3.1,§2, ADR-044 |
| ISS-P6-09 | No **format-agnostic pipeline config** (one pipeline for Shorts/Long/Stories/future platforms) | Medium | M12 | Open | P6 §1, ADR-040 |
| ISS-P6-10 | No **pipeline-level cost optimization** (batch gen, duplicate detection, provider comparison, savings suggestions beyond caching) | Medium | M12/M6 | Open | P6 §14.9 |
| ISS-P6-11 | No **Human Review for generation** (inline edit/partial-regenerate/compare/approval-chains at pipeline gates) | Medium | M12 | Open | P6 §11 |
| ISS-P6-12 | No **localization/multi-language generation** (voice + subtitle variants) | Low | M12 | Open | P6 §2,§3 |

## Part-6 Revision 1 additions (12 content-intelligence enhancements — `product-bible/PART-6-…` §16, ADR-045…049)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P6-R1-01 | No **Multi-Format Content Engine** (Format Profiles + repurpose one gen → many platform outputs; YT/Shorts/Reels/TikTok/LinkedIn/X/Pinterest/Podcast/future) | High | M12 | Open | P6R1 §16.1, ADR-045 |
| ISS-P6-R1-02 | No **Content Variation Engine** (multiple hooks/titles/thumbnails/CTAs/scripts/voices/scenes/endings; A/B) | Medium | M12/M8 | Open | P6R1 §16.2 |
| ISS-P6-R1-03 | No **Knowledge Engine** (trusted sources/KB/client-docs/PDF/crawl/RAG/citations/fact-confidence/hallucination-detect/freshness; tenant-isolated) | High | M12 | Open | P6R1 §16.3, ADR-046 |
| ISS-P6-R1-04 | No **Brand Voice Engine** (versioned tone/vocab/style/CTA/emotion/personality; multiple brand profiles) | Medium | M12 | Open | P6R1 §16.4, ADR-041 |
| ISS-P6-R1-05 | No **SEO Intelligence Engine** (intent/competitor-gap/trending/metadata/hashtags/tags/chapters/cards/end-screens/playlists) | Medium | M12 | Open | P6R1 §16.5 |
| ISS-P6-R1-06 | No **Thumbnail Intelligence** (scoring/CTR-prediction/variations/face-detect/text-opt/heatmap/brand-consistency) | Medium | M12 | Open | P6R1 §16.6, ADR-018 |
| ISS-P6-R1-07 | No **Content Compliance Engine** (copyright/unsafe/policy/sensitive/AI-disclosure-future/brand-violation detection; explainable) | High | M12 | Open | P6R1 §16.7, ADR-044 |
| ISS-P6-R1-08 | No **Learning Engine** (views/watch-time/CTR/likes/comments/retention/subs/geo/time/SEO-rank → improves future gens) | High | M12 | Open | P6R1 §16.8, ADR-043 |
| ISS-P6-R1-09 | No **Multi-Language Engine** (translation/localized script/voice/thumbnail/SEO/regional refs; locale dimension, no rebuild) | Medium | M12 | Open | P6R1 §16.9, ADR-047 |
| ISS-P6-R1-10 | No **Content Calendar Engine** (calendar/holidays/events/series/campaigns/weekly-themes/seasonal as generation input) | Medium | M12/M10 | Open | P6R1 §16.10, ADR-048 |
| ISS-P6-R1-11 | No **unified versioned Asset Library** (characters/backgrounds/music/logos/intros/outros/transitions/voices/prompts/style-packs) | High | M12 | Open | P6R1 §16.11, ADR-049 |
| ISS-P6-R1-12 | No **Pipeline Analytics Center** (per-stage success/failure/cost/time/quality/regen-count/review-count/provider-usage/opt-suggestions) | Medium | M12/M8 | Open | P6R1 §16.12 |

## Part-7 additions (Auth / AuthZ / Enterprise Security — `product-bible/PART-7-auth-security.md`, ADR-050…054)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P7-01 | No **unified identity model** (platform vs tenant planes + service accounts/API users; in-plane custom roles) | High | M13/M1 | Open | P7 §2, ADR-050 |
| ISS-P7-02 | No **MFA/SSO enforcement policy** + **enterprise SSO (SAML/OIDC) + SCIM** — TOTP exists but not policy-enforced | High | M13 | Open | P7 §3, ADR-053 |
| ISS-P7-03 | No **custom roles + permission groups + temporary permissions + approval-based escalation (PAM)** | High | M13 | Open | P7 §4, ADR-051 |
| ISS-P7-04 | No **Organization tier + teams/departments + ownership transfer** (only single-tenant memberships) | High | M13/M1 | Open | P7 §5, ADR-026 |
| ISS-P7-05 | No **enterprise session management** (active sessions/revoke/fingerprint/suspicious-activity/location-history/forced-logout) | Medium | M13 | Open | P7 §6 |
| ISS-P7-06 | No **API security suite** (scoped keys, rotation, signed+replay-protected requests/webhooks, IP allowlists) | High | M13/M8 | Open | P7 §7 |
| ISS-P7-07 | No **full Vault lifecycle** (rotation/versioning/access-policies/health/expiry/usage-audit) — extends ISS-C3/M2 | High | M13/M2 | Open | P7 §8, ADR-054 |
| ISS-P7-08 | No **unified Security Center + risk score** (platform + tenant scoped) | Medium | M13/M8 | Open | P7 §9 |
| ISS-P7-09 | No **immutable, hash-chained audit** across all security events (tamper-evidence) | High | M13 | Open | P7 §10, ADR-052 |
| ISS-P7-10 | No **compliance framework** (SOC2/ISO evidence, data residency/classification/retention, consent + sub-processor register) | Medium | M13/M8 | Open | P7 §11 |
| ISS-P7-11 | No **risk-based / step-up authentication** (anomalous-login detection) | Medium | M13 | Open | P7 §3,§6, ADR-053 |
| ISS-P7-12 | No **trusted devices + login notifications + device history** | Low | M13 | Open | P7 §3 |

## Part-7 Revision 1 additions (10 Zero-Trust & security-ops enhancements — `product-bible/PART-7-…` §14, ADR-055…059)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P7-R1-01 | No **Zero Trust** enforcement (per-request re-auth/re-authz, continuous context-aware verification, mid-session trust revocation) | High | M13 | Open | P7R1 §14.1, ADR-055 |
| ISS-P7-R1-02 | No **central versioned Security Policy Engine** (password/MFA/session/login/IP/device/API/secret/data-access; tighten-only inheritance) | High | M13 | Open | P7R1 §14.2, ADR-056 |
| ISS-P7-R1-03 | No **Data Classification** (Public/Internal/Confidential/Restricted/Secret + handling + retention rules) | Medium | M13 | Open | P7R1 §14.3 |
| ISS-P7-R1-04 | No **DLP** (sensitive/secret/PII detection, export monitoring, download policies, watermarking-future) | Medium | M13 | Open | P7R1 §14.4 |
| ISS-P7-R1-05 | No **Enterprise KMS** (platform-managed + BYOK-future keys; rotation/expiry/versioning/health/audit) | Medium | M13/M2 | Open | P7R1 §14.5, ADR-057 |
| ISS-P7-R1-06 | No **Security Incident Center** (detection/severity/response-workflow/timeline/evidence/resolution/post-incident report) | High | M13/M8 | Open | P7R1 §14.6 |
| ISS-P7-R1-07 | No **Threat Detection Engine** (brute-force/cred-stuffing/impossible-travel/API-abuse/token-abuse/priv-esc/secret-abuse/abnormal-automation; explainable) | High | M13 | Open | P7R1 §14.7, ADR-058 |
| ISS-P7-R1-08 | No **Security Analytics Center** (risk/login/threat trends, API abuse, session stats, Vault usage, audit growth, compliance status) | Medium | M13/M8 | Open | P7R1 §14.8 |
| ISS-P7-R1-09 | No **Privacy Center** (export/right-to-delete/consent/cookie-future/residency/privacy-requests/processing-history) | Medium | M13/M8 | Open | P7R1 §14.9 |
| ISS-P7-R1-10 | No **Business Continuity** (security backups/DR/account-recovery/break-glass/emergency-admin/recovery-audit) | High | M13/M8 | Open | P7R1 §14.10, ADR-059 |

## Part-8 additions (Subscription / Billing / Credits / Commercial — `product-bible/PART-8-subscription-billing-commercial.md`, ADR-060…064)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P8-01 | No **entitlement engine** enforcing plan limits server-side + overage policy (block/bill/throttle) — deepens ISS-P2-02 | Critical | M9/M11 | Open | P8 §3, ADR-061 |
| ISS-P8-02 | No **payment processor + subscriptions** (Stripe/Razorpay/Paddle/PayPal adapters, checkout, webhooks) — deepens ISS-P2-04 | Critical | M9 | Open | P8 §7, ADR-060 |
| ISS-P8-03 | No **full credit system** (typed grants/expiry/consumption-order/governor-integrated reserve+reconcile/refunds) | High | M9/M11 | Open | P8 §4, ADR-062 |
| ISS-P8-04 | No **complete usage metering** (all signals metered-at-source, tenant-isolated, reconciled vs provider bills) | High | M9/M11 | Open | P8 §5 |
| ISS-P8-05 | No **billing engine** (cycles/proration/auto-renew/dunning/grace/usage-billing; idempotent) | High | M9 | Open | P8 §6 |
| ISS-P8-06 | No **invoices & tax** (GST/VAT/exempt, credit notes, multi-currency/region, downloadable) — extends ISS-P2-17 | High | M9 | Open | P8 §8, ADR-063 |
| ISS-P8-07 | No **promotion engine** (coupons/discount/referral/campaigns/trial-extension/upgrade-discount/seasonal) | Medium | M9 | Open | P8 §9.2 |
| ISS-P8-08 | No **plan management flows** (upgrade/downgrade/pause/resume/cancel/reactivate/scheduled/proration/feature-preview) | High | M9 | Open | P8 §9.1 |
| ISS-P8-09 | No **revenue analytics** (MRR/ARR/churn/LTV/ARPU/growth/plan-distribution/renewal-forecast/failed-payments) | Medium | M9/M8 | Open | P8 §10 |
| ISS-P8-10 | No **enterprise commercials** (custom contracts/pricing/limits/PO/net-terms/SLAs/multi-year/billing-contacts/white-label) | Medium | M9/M8 | Open | P8 §11 |
| ISS-P8-11 | No **payment provider abstraction** (region/currency-based adapter routing; merchant-of-record option) | High | M9 | Open | P8 §7, ADR-060 |
| ISS-P8-12 | No **commercial audit + separation of duties** (Billing Admin vs Client Owner; every commercial action audited; payment secrets in Vault) | Medium | M9/M13 | Open | P8 §12 |

## Part-8 Revision 1 additions (10 commercial-intelligence enhancements — `product-bible/PART-8-…` §15, ADR-065…069)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P8-R1-01 | No **AI Cost Intelligence Center** (daily/weekly/monthly + per-workspace/automation/video/provider/stage cost, est-vs-actual, margin; feeds Cost Governor) | High | M9/M11 | Open | P8R1 §15.1 |
| ISS-P8-R1-02 | No **Profitability Engine** (revenue − full cost stack → profit/margin/customer-margin/plan-profitability) | High | M9 | Open | P8R1 §15.2, ADR-065 |
| ISS-P8-R1-03 | No **Enterprise Procurement** (PO/vendor-registration/approval/multi-contacts/cost-centers/department-billing/annual/workflow) | Medium | M9/M8 | Open | P8R1 §15.3 |
| ISS-P8-R1-04 | No **Reseller & Partner Program** (resellers/channel/referral/commission/revenue-share/white-label/regional; isolated partner plane) | Medium | M9/M13 | Open | P8R1 §15.4, ADR-066 |
| ISS-P8-R1-05 | No **Marketplace Commerce** (buy credits/templates/workflow/prompt/style/voice/automation packs; entitlement-based delivery) | Medium | M9/M12 | Open | P8R1 §15.5, ADR-067 |
| ISS-P8-R1-06 | No **Commercial Policy Engine** (pricing/discount/promo/tax/credit/refund/renewal/grace/overage; versioned config) | High | M9 | Open | P8R1 §15.6, ADR-068 |
| ISS-P8-R1-07 | No **Customer Success Analytics** (health/expansion/upgrade-prediction/churn-prediction/AI-adoption/automation-adoption/workspace+team growth; explainable) | Medium | M9/M8 | Open | P8R1 §15.7 |
| ISS-P8-R1-08 | No **Billing Simulator** (simulate new plans/prices/credit/provider-cost/AI-cost/currency changes → business impact before publish) | Medium | M9/M8 | Open | P8R1 §15.8 |
| ISS-P8-R1-09 | No **Financial Audit Center** (immutable invoice-change/refund/credit/payment-failure/revenue-correction/tax/manual-adjustment; reason+approval) | High | M9/M13 | Open | P8R1 §15.9, ADR-069 |
| ISS-P8-R1-10 | No **Commercial Observability** (billing-engine/payment-success/credit-usage/failed-payments/invoice-gen/tax-processing/provider/revenue health) | Medium | M9/M8 | Open | P8R1 §15.10 |

## Part-9 additions (Backend: Database/API/Events — `product-bible/PART-9-database-api-events.md`, ADR-070…074)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P9-01 | No **domain-driven bounded contexts** (prototype = ~48 flat tables, no ownership boundaries) | High | M14/M1 | Open | P9 §2, ADR-071 |
| ISS-P9-02 | No **event bus + transactional outbox + idempotency store** (durable event backbone) | Critical | M14/M11 | Open | P9 §3, ADR-070; extends ISS-P2-12 |
| ISS-P9-03 | No **event catalog + versioned event contracts** | High | M14 | Open | P9 §4 |
| ISS-P9-04 | No **versioned API surface + API standards** (internal-only today) | High | M14 | Open | P9 §5,§6, ADR-072 |
| ISS-P9-05 | No **streaming APIs** (SSE/WebSocket for live timeline/logs/progress) | Medium | M14/M11 | Open | P9 §5 |
| ISS-P9-06 | No **provider-abstracted storage + lifecycle/retention/archival** (single provider, public-bucket issue) | High | M14/M2 | Open | P9 §7, ADR-073; extends ISS-C2/E4 |
| ISS-P9-07 | No **search layer** (workspace/asset/knowledge/global/semantic, permission-filtered) | Medium | M14 | Open | P9 §8 |
| ISS-P9-08 | No **multi-layer caching + event-driven invalidation** (only ad-hoc prompt cache) | Medium | M14 | Open | P9 §9, ADR-073 |
| ISS-P9-09 | No **unified observability** (end-to-end correlation IDs, distributed tracing, event/provider/API monitoring) | High | M14/M8 | Open | P9 §10 |
| ISS-P9-10 | No **data governance engine** (retention/soft-hard-delete/lineage/residency/recovery beyond current soft-delete) | Medium | M14/M13 | Open | P9 §11 |
| ISS-P9-11 | **Missing domains** (Localization, Webhooks/Integrations, Outbox/Idempotency, Incidents, API-Keys, DLQ as first-class stores) | Medium | M14 | Open | P9 §2.2 |
| ISS-P9-12 | No **partition + rollup strategy** for high-volume tables (events/usage/audit/api-usage/pipeline-stages) | High | M14 | Open | P9 §10, ADR-074; extends ADR-007 |

## Part-9 Revision 1 additions (10 backend-governance/gateway/simulation enhancements — `product-bible/PART-9-…` §14, ADR-075…079)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P9-R1-01 | No **data-mesh domain governance** (owner/steward/data-contract/SLA/version-policy/consumer-rules/change-mgmt per domain; pluggable domains) | Medium | M14 | Open | P9R1 §14.1, ADR-075 |
| ISS-P9-R1-02 | No **schema evolution strategy** (backward/forward-compat, safe-deprecation, expand→migrate→contract zero-downtime, data-migration) | High | M14 | Open | P9R1 §14.2, ADR-076 |
| ISS-P9-R1-03 | No **Event Governance Center** (event registry/catalog/versioning/ownership/retention/replay/discovery/docs) | High | M14 | Open | P9R1 §14.3, ADR-077 |
| ISS-P9-R1-04 | No **API Gateway** (central authN/authZ/rate-limit/routing/transformation/versioning/validation/logging/monitoring/analytics) | High | M14/M13 | Open | P9R1 §14.4, ADR-078 |
| ISS-P9-R1-05 | No **Integration Hub** (external APIs/OAuth/webhooks/event+import+export connectors/marketplace-integrations; provider-independent) | Medium | M14 | Open | P9R1 §14.5, ADR-003 |
| ISS-P9-R1-06 | No **Data Quality Engine** (validation/dedup/consistency/missing-data/drift/integrity checks; explainable reports) | Medium | M14 | Open | P9R1 §14.6, ADR-018 |
| ISS-P9-R1-07 | No **Global Configuration Service** (platform/tenant/workspace/env/runtime/feature config; versioned/audited/layered-precedence) | High | M14 | Open | P9R1 §14.7, ADR-079 |
| ISS-P9-R1-08 | No **Service Discovery** (registration/discovery/health-checks/routing/failover; monolith→microservices path) | Medium | M14 | Open | P9R1 §14.8, ADR-079 |
| ISS-P9-R1-09 | No **Platform Observability Platform** (unified pane: business/technical/AI/commercial/security/workflow/provider metrics; one trace) | Medium | M14/M8 | Open | P9R1 §14.9 |
| ISS-P9-R1-10 | No **Platform Digital Twin** (simulate events/APIs/workflows/billing/AI-cost/provider-failures/queue-saturation/infra-failures; isolated) | Low | M14 | Open | P9R1 §14.10, ADR-019 |

## Part-10 additions (Manual/Auto Workflow, Human Review & Operations — `product-bible/PART-10-manual-auto-workflow-operations.md`, ADR-080…082)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P10-01 | No **three-mode workflow presets** (Manual/Semi-Auto/Fully-Auto) switchable over the per-stage matrix — extends ISS-P3-03 | High | M15 | Open | P10 §1, ADR-080 |
| ISS-P10-02 | No **Conditional Approval** (pause on quality/cost/compliance/first-run/new-asset signals) | High | M15 | Open | P10 §2, ADR-081 |
| ISS-P10-03 | No **Human Review Center** (queue/priority/filters/assignment/bulk/AI-suggestions/comments) | High | M15 | Open | P10 §3 |
| ISS-P10-04 | No **Review Experience** (before/after, cost+quality diff, AI explanation, version/change history) | Medium | M15 | Open | P10 §6 |
| ISS-P10-05 | No **Operations Center** (live jobs view + operational verbs + Emergency Stop/Mass Pause/Resume) | High | M15/M11 | Open | P10 §4,§8 |
| ISS-P10-06 | No **versioned manual editing** (no overwrite; every edit new version; rollback) across scripts/prompts/images/metadata/etc. | High | M15 | Open | P10 §7, ADR-082 |
| ISS-P10-07 | No **unified Notification Center** (email/in-app/push/webhook/future-SMS × 10 categories; per-user config; deep-links) | Medium | M15 | Open | P10 §5 |
| ISS-P10-08 | No **collaboration** (comments/mentions/assignments/reviewers/approvers/observers/internal-notes/activity-timeline) | Medium | M15/M13 | Open | P10 §9 |
| ISS-P10-09 | No **operational analytics** (automation-%/manual-%/AI-acceptance/human-edit-rate/review-time/approval/failure/recovery/retry) | Medium | M15/M8 | Open | P10 §10 |
| ISS-P10-10 | No **approval chains for teams/enterprise** (multi-approver gates) — extends Part 4 ADR-026 | Medium | M15/M13 | Open | P10 §9 |

## Part-10 Revision 1 additions (10 enterprise-operations enhancements — `product-bible/PART-10-…` §13, ADR-083…087)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P10-R1-01 | No **AI Operations Center (AIOps)** unified pane (pipeline/workflows/provider/queue/worker/cost/quality health + review queue + automation/recovery) | High | M15/M8 | Open | P10R1 §13.1 |
| ISS-P10-R1-02 | No **Global Approval Policy Engine** (workspace/role/content-type/length/cost/quality/first-run/brand-risk/compliance/platform-driven) | High | M15 | Open | P10R1 §13.2, ADR-083 |
| ISS-P10-R1-03 | No **Operation Playbooks** (new-workspace/first-automation/failed-provider/high-cost/low-quality/publish-failure/compliance/emergency-stop; step-guided) | Medium | M15 | Open | P10R1 §13.3, ADR-087 |
| ISS-P10-R1-04 | No **enterprise approval chains** (configurable sequential/parallel multi-department; conditional steps; rejection-return) | Medium | M15/M13 | Open | P10R1 §13.4, ADR-084 |
| ISS-P10-R1-05 | No **Shift & Operator Management** (shifts/assignment/workload/escalation/handover/presence/availability) | Low | M15 | Open | P10R1 §13.5 |
| ISS-P10-R1-06 | No **SLA Monitoring** (review/approval/generation/publishing/recovery SLAs; pre-breach warnings) | Medium | M15/M9 | Open | P10R1 §13.6, ADR-085 |
| ISS-P10-R1-07 | No **Incident Operations** (operational/provider/AI/publishing/cost/workflow incidents; detection/timeline/owner/resolution/root-cause) | High | M15/M13 | Open | P10R1 §13.7, ADR-086 |
| ISS-P10-R1-08 | No **Operations Knowledge Assistant** (SOP-search/troubleshooting/recommended-actions/similar-incidents/best-practices; read-only propose-only) | Medium | M15/M12 | Open | P10R1 §13.8, ADR-087 |
| ISS-P10-R1-09 | No **Workspace Health Score** (automation/content/AI/publishing/cost/team/review health composite + explainable recs) | Medium | M15/M8 | Open | P10R1 §13.9, ADR-018 |
| ISS-P10-R1-10 | No **Execution Simulation** (simulate approval-policies/manual/auto/notifications/scheduling/provider-failure; never affects prod) | Low | M15/M14 | Open | P10R1 §13.10, ADR-019 |

## Part-11 additions (Enterprise Platform & Ecosystem — `product-bible/PART-11-enterprise-whitelabel-ecosystem.md`, ADR-088…092)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P11-01 | No **white-label deployment** (custom domain + full brand resolution across login/emails/notifications/reports/PDFs/assistant/help) | Medium | M16 | Open | P11 §1, ADR-088 |
| ISS-P11-02 | No **Agency Console** (multi-client mgmt, scoped switching, consolidated billing, cross-client reporting, agency templates) | High | M16 | Open | P11 §2, ADR-089 |
| ISS-P11-03 | No **full enterprise org hierarchy** (BU→dept→team→workspace, cost centers, department billing, business units) — extends ADR-026 | High | M16/M13 | Open | P11 §3 |
| ISS-P11-04 | No **Marketplace** (listings, versioned copy-on-use assets, review/compliance gating, revenue share, discovery) | Medium | M16/M12 | Open | P11 §4, ADR-067 |
| ISS-P11-05 | No **partner ecosystem + portal** (technology/AI-provider/agency/reseller/integrator/consultant; certification) — extends ADR-066 | Medium | M16 | Open | P11 §5, ADR-089 |
| ISS-P11-06 | No **Public Developer Platform** (public API + OAuth apps + developer portal + sandbox + SDKs/CLI/webhooks) | Medium | M16/M14 | Open | P11 §6, ADR-078 |
| ISS-P11-07 | No **plugin architecture** (registry/sandboxed-isolation/scoped-permissions/approval/updates/rollback) | Medium | M16 | Open | P11 §7, ADR-090 |
| ISS-P11-08 | No **integration marketplace** (provider-independent connectors CRM/CMS/storage/analytics/marketing/comms/AI; event-connected) | Medium | M16/M14 | Open | P11 §8, ADR-073 |
| ISS-P11-09 | No **enterprise analytics** (cross-workspace/department/region/brand, executive dashboards, forecasting/BI) | Medium | M16/M8 | Open | P11 §9, ADR-074 |
| ISS-P11-10 | No **unified enterprise governance** (versioned/audited/inherited org/compliance/approval/AI/security/retention policies) | High | M16/M13 | Open | P11 §10, ADR-091 |
| ISS-P11-11 | No **enterprise-readiness posture** (multi-region/multi-cloud/regulated-vertical config paths, no redesign) | Medium | M16 | Open | P11 §11, ADR-092 |
| ISS-P11-12 | No **scoped consented account access** (agency/consultant client access distinct from operator impersonation) | Medium | M16/M13 | Open | P11 §2,§5, ADR-089 |

## Part-11 Revision 1 additions (10 enterprise-management/intelligence enhancements — `product-bible/PART-11-…` §14, ADR-093…097)
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P11-R1-01 | No **Multi-Tenant White Label Manager** (brand inheritance/versioning/preview/publish/rollback/validation/approval/multi-brand/regional/seasonal) | Medium | M16 | Open | P11R1 §14.1, ADR-093 |
| ISS-P11-R1-02 | No **Enterprise AI Governance** (approved/blocked models, cost limits, prompt/usage/compliance policies, AI approval workflows) | High | M16/M13 | Open | P11R1 §14.2, ADR-094 |
| ISS-P11-R1-03 | No **Marketplace Governance** (publisher-verification/certification/compatibility/security-scan/AI-quality-validation/rev-share/ratings/reviews/install-analytics/deprecation) | Medium | M16/M12 | Open | P11R1 §14.3, ADR-095 |
| ISS-P11-R1-04 | No **Developer Experience (DX)** (API playground/SDK-generator/explorer/samples/testing-console/webhook+OAuth testers/dev-analytics/usage-dashboard) | Medium | M16/M14 | Open | P11R1 §14.4, ADR-019/078 |
| ISS-P11-R1-05 | No **Enterprise Migration Center** (import-wizard/data-mapping/validation/preview/rollback/dry-run/progress/report) | Medium | M16 | Open | P11R1 §14.5, ADR-028 |
| ISS-P11-R1-06 | No **Enterprise Feature Management** (org-scoped control of features/modules/AI-capabilities/experiments/marketplace-assets/plugins; versioned/audited) | Medium | M16/M8 | Open | P11R1 §14.6, ADR-091 |
| ISS-P11-R1-07 | No **Customer Success Platform** (customer-health/adoption/expansion/renewal-risk/success-playbooks/QBR/executive-reports) | Medium | M16/M9 | Open | P11R1 §14.7, ADR-087 |
| ISS-P11-R1-08 | No **Platform Intelligence** (platform-recommendations/usage-insights/cost-optimization/growth/automation/AI-optimization; explainable propose-only) | Medium | M16/M8 | Open | P11R1 §14.8, ADR-014 |
| ISS-P11-R1-09 | No **Global Localization Framework** (languages/timezones/regions/currency/local-compliance/regional-holidays/regional-AI-policies) | Medium | M16 | Open | P11R1 §14.9, ADR-096 |
| ISS-P11-R1-10 | No **Enterprise Readiness Certification** (architecture/security/scalability/compliance/cost/AI/operations scores → explainable report) | Medium | M16 | Open | P11R1 §14.10, ADR-097 |

## Part-12 additions (Product Governance & Long-Term Evolution — `product-bible/PART-12-future-roadmap-vision.md`, ADR-098)
*(Process/governance items — not feature gaps. The roadmap validated that every 5–10yr capability maps to an existing extension point; no new architecture needed.)*
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P12-01 | Establish the ongoing **Product Governance process** (versioning/change-mgmt/deprecation/review per ADR-098) as a living rule once implementation begins | Low | M17 | Open | P12 §9, ADR-098 |
| ISS-P12-02 | Maintain the **Roadmap/Maturity model** (Stage 1→7) as a living planning artifact; per-capability no-redesign check vs existing extension points | Low | M17 | Open | P12 §1 |
| ISS-P12-03 | Establish a **periodic Architecture Review cadence** (post-Freeze) to keep ADRs/backlog reconciled as the platform evolves | Low | M17 | Open | P12 §12.2 |

## Part-12 Revision 1 additions (3 governance/process items — `product-bible/PART-12-…` §13, ADR-099…100)
*(Governance/process — not feature gaps. Completes the Product Bible.)*
| ID | Issue / gap | Sev | Task | Status | Source |
|---|---|---|---|---|---|
| ISS-P12-R1-01 | Establish **governed AI model lifecycle** (candidate→evaluated→approved→active→deprecated→retired + maturity levels + evaluation/benchmarking + retirement/replacement) | Low | M17/M12 | Open | P12R1 §13.1, ADR-099 |
| ISS-P12-R1-02 | Establish **unified product lifecycle** (Alpha→Beta→GA→LTS→Deprecated→Sunset→Archived) for features/APIs/workflows/plugins/marketplace-assets | Low | M17 | Open | P12R1 §13.2, ADR-100 |
| ISS-P12-R1-03 | Establish **Product Bible governance operations** (review cadences, Architecture Review Board, change-approval workflow, annual architecture audit) | Low | M17 | Open | P12R1 §13.8, ADR-098 |

**Change log:**
- 2026-07-20 — created from the accepted Vision-Compliance Audit (21 items).
- 2026-07-20 — **Part 2** added: 17 items (ISS-P2-01…17); new epics **M8** (Platform Console completeness) and **M9** (Commercial/Billing). Total tracked: 38.
- 2026-07-20 — **Part 2 Revision 1** added: 10 items (ISS-P2-R1-01…10) for the enterprise capabilities in §11; ADR-005…009 recorded in `product-bible/ADR.md`. Total tracked: 48.
- 2026-07-20 — **Part 3 (Draft v1.0)** added: 12 items (ISS-P3-01…12); new epic **M10** (Client Workspace Experience); ADR-011…016 recorded. Total tracked: 60.
- 2026-07-20 — **Part 3 Revision 1** (APPROVED & LOCKED) added: 11 items (ISS-P3-R1-01…11) for the §19 enhancements incl. the Workflow-Driven Architecture reframe; ADR-017…020 recorded. Total tracked: 71.
- 2026-07-20 — **Part 4 (Draft v1.0)** added: 12 items (ISS-P4-01…12) under M10; ADR-021…024 recorded. Total tracked: 83.
- 2026-07-20 — **Part 4 Revision 1** (APPROVED & LOCKED) added: 14 items (ISS-P4-R1-01…14) for the §20 onboarding enhancements; ADR-025…029 recorded. Total tracked: 97.
- 2026-07-20 — **Part 5 (Draft v1.0)** added: 12 items (ISS-P5-01…12); new epic **M11** (Automation Engine — durable workflow/job runtime, absorbs M4/M5); ADR-030…034 recorded. Total tracked: 109.
- 2026-07-20 — **Part 5 Revision 1** (APPROVED & LOCKED) added: 12 items (ISS-P5-R1-01…12) for the §17 engine enhancements; ADR-035…039 recorded. Total tracked: 121.
- 2026-07-20 — **Part 6 (Draft v1.0)** added: 12 items (ISS-P6-01…12); new epic **M12** (AI Generation Pipeline — content intelligence, runs on M11); ADR-040…044 recorded. Total tracked: 133.
- 2026-07-20 — **Part 6 Revision 1** (APPROVED & LOCKED) added: 12 items (ISS-P6-R1-01…12) for the §16 content-intelligence enhancements; ADR-045…049 recorded. Total tracked: 145.
- 2026-07-20 — **Part 7 (Draft v1.0)** added: 12 items (ISS-P7-01…12); new epic **M13** (Enterprise Security — identity/authN/authZ/Vault/audit/compliance); ADR-050…054 recorded. Total tracked: 157.
- 2026-07-20 — **Part 7 Revision 1** (APPROVED & LOCKED) added: 10 items (ISS-P7-R1-01…10) for the §14 Zero-Trust & security-ops enhancements; ADR-055…059 recorded. Total tracked: 167.
- 2026-07-20 — **Part 8 (Draft v1.0)** added: 12 items (ISS-P8-01…12) under epic **M9** (Commercial/Billing — now the full commercial layer); ADR-060…064 recorded. Total tracked: 179.
- 2026-07-20 — **Part 8 Revision 1** (APPROVED & LOCKED) added: 10 items (ISS-P8-R1-01…10) for the §15 commercial-intelligence enhancements; ADR-065…069 recorded. Total tracked: 189.
- 2026-07-20 — **Part 9 (Draft v1.0)** added: 12 items (ISS-P9-01…12); new epic **M14** (Backend Architecture — domains/events/APIs/storage/search/cache/observability/governance, underpins M8–M13); ADR-070…074 recorded. Total tracked: 201.
- 2026-07-20 — **Part 9 Revision 1** (APPROVED & LOCKED) added: 10 items (ISS-P9-R1-01…10) for the §14 backend-governance/gateway/simulation enhancements; ADR-075…079 recorded. Total tracked: 211.
- 2026-07-20 — **Part 10 (Draft v1.0)** added: 10 items (ISS-P10-01…10); new epic **M15** (Operations & Human-in-the-Loop — modes/review/operations/collaboration); ADR-080…082 recorded. Total tracked: 221.
- 2026-07-20 — **Part 10 Revision 1** (APPROVED & LOCKED) added: 10 items (ISS-P10-R1-01…10) for the §13 enterprise-operations enhancements; ADR-083…087 recorded. Total tracked: 231.
- 2026-07-20 — **Part 11 (Draft v1.0)** added: 12 items (ISS-P11-01…12); new epic **M16** (Enterprise Platform & Ecosystem — white-label/agency/marketplace/partners/developer-platform/plugins/integrations/governance, composes M8–M15); ADR-088…092 recorded. Total tracked: 243.
- 2026-07-20 — **Part 11 Revision 1** (APPROVED & LOCKED) added: 10 items (ISS-P11-R1-01…10) for the §14 enterprise-management/intelligence enhancements; ADR-093…097 recorded. Total tracked: 253.
- 2026-07-20 — **Part 12 (Draft v1.0)** added: 3 governance/process items (ISS-P12-01…03); new epic **M17** (Product Governance & Long-Term Evolution); ADR-098 recorded. **Part 12 is the FINAL Bible document** — a roadmap over existing architecture, no new feature gaps. Total tracked: 256.
- 2026-07-20 — **Part 12 Revision 1** (APPROVED & LOCKED) added: 3 governance/process items (ISS-P12-R1-01…03); ADR-099…100 recorded. **This completes the Product Bible (all 12 Parts locked; ADRs 001–100).** Total tracked: 259.

**★ PRODUCT BIBLE COMPLETE (2026-07-20).** All 12 Parts authored & locked; ADRs 001–100 (append-only); **259 tracked items across epics M1–M17**. This Migration Backlog is the **authoritative implementation work-list** for the Architecture Freeze. Sequencing rule stands: **M1 → M2 → M3 before any new client feature.** No implementation until the Architecture Freeze deliverables **F1–F4 are approved** (owner-initiated, see `ARCHITECTURE-FREEZE.md`).
