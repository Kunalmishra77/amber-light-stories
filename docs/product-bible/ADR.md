# Architecture Decision Records (ADR) — YT-Automation

Authoritative, append-only log of significant architecture decisions. Each ADR: context → decision → consequences. Referenced by the Product Bible. Changing an accepted ADR requires a superseding ADR (never silent edits).

---

### ADR-001 — Separate platform and tenant shells
**Context:** the prototype renders `/admin` (platform) and the client workspace in one shell; super-admins see both (ISS-A1). **Decision:** two distinct shells — a platform console (platform brand only) for `/admin/*` and a tenant workspace for clients. A super-admin with no active impersonation lands on `/admin`, never a client dashboard. **Consequences:** clear separation, no context confusion; requires routing + layout split (M1). **Status:** Accepted.

### ADR-002 — Super Admin is a platform role only; workspace entry via audited impersonation
**Context:** the super-admin is currently a `client_owner` member of a tenant (ISS-C1). **Decision:** platform operators hold **no tenant membership**; to view/act in a client workspace they use **time-boxed, fully-audited impersonation** ("View as tenant"). **Consequences:** true isolation, compliant support access; requires an impersonation console (ISS-P2-01). **Status:** Accepted.

### ADR-003 — Provider-adapter pattern for AI, publishing, and storage
**Context:** cost/quality vary by provider; must support future providers/platforms/storage. **Decision:** all external providers sit behind stable adapter interfaces resolved from **config** (registry + routing), never hardcoded. **Consequences:** swap fal↔Replicate↔self-host, YouTube↔IG↔TikTok, Supabase↔R2 by configuration; enables Cost Simulator & Experiments. **Status:** Accepted.

### ADR-004 — Entitlement-driven feature & quota gating
**Context:** plans must actually limit usage. **Decision:** plans define entitlements (videos, credits, seats, storage, models, automation, channels); enforcement is **server-side** on every gated action, fed by usage metering. **Consequences:** protects margins, enables upsell; requires an entitlements engine (ISS-P2-02). **Status:** Accepted.

### ADR-005 — Central AI Gateway for all model calls
**Context:** AI calls are the main cost + reliability risk. **Decision:** all model calls route through a central **AI Gateway** (routing by tier, cost accounting, fallback, rate-limit, caching hooks). **Consequences:** one place for cost control, observability, and provider swaps; feeds AI Observability & Recommendations. **Status:** Accepted.

### ADR-006 — Global library reuse via copy-on-use
**Context:** platform wants shared characters/voices/prompts/templates without breaking tenant isolation. **Decision:** platform masters are read-only references; a tenant **adopts** an item → an isolated copy in its own library. **Consequences:** reuse + isolation coexist; groundwork for a future Marketplace. **Status:** Accepted.

### ADR-007 — Event bus, webhooks, analytics rollups, and partitioning
**Context:** extensibility + scale (millions of rows/requests). **Decision:** emit domain events (bus + webhooks) for integrations; compute analytics via **nightly rollups**; **partition + retention** on high-volume tables (api_usage, events, audit, pipeline_stages). **Consequences:** scalable dashboards + integration surface; more infra. **Status:** Accepted.

### ADR-008 — AI Assistant is read-only and RAG-grounded; proposes, never auto-mutates
**Context:** an operator copilot could be dangerous if it mutates platform state. **Decision:** the Assistant reads platform data/aggregates + a docs/runbook index; it **suggests** actions the operator confirms; it never writes directly and never accesses raw tenant content beyond aggregates. **Consequences:** safe, auditable assistance. **Status:** Accepted.

### ADR-009 — Feature Release Center subsumes raw feature flags
**Context:** enterprise rollouts need staged control, not bare flags. **Decision:** a Release Center wraps flags with beta/internal/limited/percentage rollout, versioning, targeting, and one-click rollback. **Consequences:** safe progressive delivery; flags become a tab within it. **Status:** Accepted.

### ADR-010 — Platform secrets in Vault/secret store; impersonation time-boxed + audited
**Context:** leaked `.env` dev keys (ISS-C3); support access risk. **Decision:** platform + tenant secrets live in Vault/secret stores (never code/`.env`) with rotation; impersonation sessions are time-boxed and fully audited. **Consequences:** production-grade security; requires secret migration (M2) + impersonation controls. **Status:** Accepted.

*(Rev 1, 2026-07-20: ADR-001…010 recorded alongside Part 2 Revision 1.)*

---

### ADR-011 — Client lifecycle is an explicit state machine
**Context:** the client journey (provision → setup → approval → operate → renew/expand → suspend/archive) was managed by scattered boolean flags. **Decision:** model the whole workspace lifecycle as **explicit states** (Provisioned, First Login, Welcome, Setup, API Config, Subscription, Submitted, Approved/Activated, Daily Ops, Paused/Past-Due, Suspended, Archived→Purged); UI, entitlements, and automation all gate on the current state. **Consequences:** consistent gating, no impossible states; requires a lifecycle engine (ISS-P3 / M10). **Status:** Accepted. **Source:** Part 3 §1.

### ADR-012 — A single versioned Workspace Profile is the sole automation-config source
**Context:** setup data and settings risk being scattered/hardcoded. **Decision:** the Setup Wizard + Settings author **one versioned Workspace Profile**; all automation defaults (brand, niche, audience, cadence, providers, models, approval matrix) are read from its **active version**; edits create new versions (revision history). **Consequences:** kills hardcoding (Part 1 invariant), enables safe rollback + audit; requires a profile store. **Status:** Accepted. **Source:** Part 3 §3.

### ADR-013 — Manual vs Automatic is a per-stage policy matrix, not a global toggle
**Context:** a single manual/auto switch is too coarse and unsafe for paid stages. **Decision:** each pipeline stage carries its own **manual|auto** policy; hybrid is the default; **paid stages and publishing default to manual** with a workspace-wide "require approval before any paid stage" safety toggle (default ON, aligns with Part 1's paid-run rule). **Consequences:** safer cost control + flexibility; generalizes the prototype's auto-approve matrix. **Status:** Accepted. **Source:** Part 3 §8.

### ADR-014 — Workspace AI Assistant is tenant-scoped, read-only, propose-only
**Context:** clients want a copilot but it must not breach isolation or mutate silently. **Decision:** the workspace Assistant reads **only this tenant's** data + a help/runbook index, answers/strategizes, and **proposes** actions the owner confirms — never writes directly, never crosses tenants (workspace mirror of ADR-008). **Consequences:** safe, auditable client assistance. **Status:** Accepted. **Source:** Part 3 §10.

### ADR-015 — Publishing uses a platform-agnostic destination abstraction
**Context:** today YouTube-only, but Instagram/TikTok/etc. are on the roadmap. **Decision:** model publishing **destinations generically** (a channel is a typed publishing target behind an adapter); YouTube is the first adapter. **Consequences:** new networks become config/adapters with **no re-architecture** (Part 3 §14); complements ADR-003. **Status:** Accepted. **Source:** Part 3 §14.

### ADR-016 — Notifications run through one event-driven service with per-user channel prefs
**Context:** per-feature notification code fragments and misses categories. **Decision:** a **single event-driven notification service** (on the platform event bus, ADR-007) fans domain events to channels (in-app now; email; push/webhook future) per **per-user category preferences**. **Consequences:** complete, consistent notifications; one place to extend channels. **Status:** Accepted. **Source:** Part 3 §11.

*(2026-07-20: ADR-011…016 recorded alongside Part 3 (Draft v1.0). ADRs are accepted-on-record even while Part 3 awaits review; a superseding ADR is required to change them.)*

---

### ADR-017 — Workflow-Driven Architecture: jobs & workflows are the product
**Context:** designing the workspace as isolated pages fragments logic and duplicates state. **Decision:** the workspace is a set of **first-class Jobs & Workflows** (Planning, Research, Script, Scene, Prompt, Image, Animation, Voice, Subtitle, Rendering, SEO, Publishing, Analytics, Optimization). Each job has a **uniform lifecycle** (queued→running→paused→succeeded/failed→retrying), uniform observability (logs, cost, timing), and a uniform control surface (run/pause/retry/cancel/rollback). **Every page merely visualizes or controls jobs.** **Consequences:** the pipeline, live timeline, cost breakdown, quality score, sandbox, manual/auto policy, entitlement metering, and notifications all compose over the same job primitive; consistent with the platform Queue/Job Manager (Part 2 §2.3, ISS-P2-05). **Status:** Accepted. **Source:** Part 3 Rev 1 §19.11.

### ADR-018 — Quality & Readiness scores are explainable, weighted, and evaluator-pluggable
**Context:** clients need trustworthy quality/readiness signals that can improve over time. **Decision:** the **AI Quality Score** (per video) and **Workspace Readiness Score** are computed from **weighted, explainable** dimensions (rules-based checks optionally augmented by an LLM/AI evaluator via the Gateway); weights live in the Workspace Profile; evaluators are **pluggable adapters** (future AI-evaluation providers drop in). Every score exposes the factors that moved it. **Consequences:** transparent scores, configurable per workspace, future-proof; low scores can auto-route items back to manual review. **Status:** Accepted. **Source:** Part 3 Rev 1 §19.4, §19.5.

### ADR-019 — Automation Sandbox guarantees no production side effects
**Context:** clients must safely test automation before going live. **Decision:** **Sandbox** mode (test/dry/preview/partial/provider-test/publishing-simulation) runs jobs with **side-effecting adapters stubbed** — the Publishing adapter is simulated and **never** posts real content; runs are cost-capped (prefer $0 dry runs per Part 1) and don't consume real credits unless the owner confirms a validated micro-cost provider test. **Consequences:** safe experimentation; aligns with the paid-run permission rule. **Status:** Accepted. **Source:** Part 3 Rev 1 §19.3.

### ADR-020 — Cost is estimated before runs and reconciled after
**Context:** clients must understand spend prospectively and retrospectively. **Decision:** the **Estimator** projects cost/credits/storage/render-time **before** automation (from cadence × scene-tier routing × price registry × historical actuals), enforced against entitlements; after each run the **per-video Cost Breakdown** reconciles **estimate vs actual** from AI Gateway accounting. **Consequences:** no surprise spend, optimize-before-run, feeds Business Insights cost-saving. **Status:** Accepted. **Source:** Part 3 Rev 1 §19.2, §19.6.

*(2026-07-20: ADR-017…020 recorded alongside Part 3 Revision 1 (APPROVED & LOCKED).)*

---

### ADR-021 — Onboarding is a stateful, resumable Setup Assistant (coach, not form)
**Context:** a linear public wizard loses progress and feels like software, not guidance. **Decision:** onboarding is a **server-persisted step state machine** driven by an intelligent Setup Assistant that estimates time, autosaves every field, resumes at the exact step, offers AI prefill/best-practice suggestions (propose-only), and detects mistakes live. **Consequences:** higher activation, lower support load, full resume/abandonment handling; each step is a job (ADR-017). **Status:** Accepted (Draft — Part 4 awaiting review). **Source:** Part 4 §3.

### ADR-022 — Validation is a continuous, declarative, severity-tiered engine
**Context:** submit-only validation frustrates users and drifts from admin review. **Decision:** a **single declarative rule set** validates continuously; issues are **severity-tiered** (block vs warn); **capability-coverage** (LLM+Voice+Visual+Publishing) gates Submit; the same rules power live hints, the submit gate, and Super-Admin review. **Consequences:** consistent validation everywhere, no drift, optional gaps never block. **Status:** Accepted (Draft). **Source:** Part 4 §9.

### ADR-023 — Onboarding is crash-safe and idempotent
**Context:** browser/network/session/payment failures must never corrupt or lose onboarding. **Decision:** every step **autosaves server-side**; each failure scenario has a defined **recovery/retry/rollback/notify/audit** path; operations are idempotent so retries can't double-create (e.g., duplicate workspace). **Consequences:** robust onboarding, no half-activated workspaces, full auditability. **Status:** Accepted (Draft). **Source:** Part 4 §10.

### ADR-024 — First automation is a guided, sandbox-first "aha" flow
**Context:** the first run is the retention moment and the biggest cost/mistake risk. **Decision:** the first automation runs **sandbox-first** (~$0, no side effects, ADR-019) through plan→script→video→preview→approve, then a **single explicitly-confirmed real publish** (Part 1 paid-run rule), ending in an explicit celebration. **Consequences:** de-risked, cost-transparent, memorable activation. **Status:** Accepted (Draft). **Source:** Part 4 §13.

*(2026-07-20: ADR-021…024 recorded alongside Part 4 (Draft v1.0). Accepted-on-record while Part 4 awaits review; superseding ADR required to change.)*

---

### ADR-025 — The Setup Wizard is dynamic/rules-driven
**Context:** a static wizard shows irrelevant steps and overwhelms non-technical clients. **Decision:** the visible step/field set is **computed** from subscription plan, target country, language, content type, business category, selected AI providers, publishing platform, manual/auto mode, and beginner/advanced expertise; rules are **config-driven** (no hardcoding) and share the declarative engine used by Validation (ADR-022). Beginner/Advanced changes **presentation density only**, never required data or validations. **Consequences:** shorter, relevant onboarding; consistent eligibility+validation; future providers/platforms extend rules, not code. **Status:** Accepted (Part 4 Rev 1). **Source:** §20.2, §20.3.

### ADR-026 — Onboarding is organization-ready (optional tier above the workspace)
**Context:** enterprise (orgs, departments, multi-workspace, approval chains) must not force an onboarding redesign later. **Decision:** model an **optional Organization tier above workspaces**; an org can own many workspaces, approval chains generalize the single Super-Admin approval, and regional settings inherit downward. Today's single-workspace onboarding is the degenerate case. **Consequences:** enterprise onboarding is additive; complements Part 2 tenancy and ADR-015 (multi-channel). **Status:** Accepted (Part 4 Rev 1). **Source:** §20.9.

### ADR-027 — A server-enforced Workspace Activation Checklist is the single activation gate
**Context:** activation must be unambiguous and tamper-proof. **Decision:** the lifecycle transition `provisioning → active` (Part 3 §1) occurs **only** when a **server-enforced checklist** passes: Brand complete · APIs connected · Subscription active · Approval complete · Publishing ready · Notifications active · Security valid · Automation configured · Readiness ≥ threshold. The Readiness engine supplies inputs. **Consequences:** no half-activated workspaces; one authoritative gate; client-side cannot bypass. **Status:** Accepted (Part 4 Rev 1). **Source:** §20.14.

### ADR-028 — Import/Clone uses validated, previewed deep-copy preserving isolation
**Context:** clients want to import/clone workspaces, brand kits, prompt libraries, rules, and migrate from other platforms. **Decision:** import/clone performs a **validated, previewed deep-copy** (copy-on-use, ADR-006) into the target workspace's versioned profile/libraries — never a shared reference; provenance is recorded and the operation is audited; cross-platform migration is adapter-based. **Consequences:** fast setup + safe reuse without breaking tenant isolation. **Status:** Accepted (Part 4 Rev 1). **Source:** §20.4.

### ADR-029 — Onboarding emits an immutable audit trail and a Readiness Certificate
**Context:** trust, compliance, and confidence require a complete record. **Decision:** every onboarding action writes to an **immutable, queryable audit stream** (password change, API connect, payment, submit, approval, config change, validation fail, retry, import, mode switch, certificate issuance); at successful activation the system emits a **Workspace Ready Certificate** snapshot (providers, security/automation/publishing status, readiness score, next steps). **Consequences:** auditable onboarding, Super-Admin review inputs, client confidence artifact. **Status:** Accepted (Part 4 Rev 1). **Source:** §20.8, §20.10.

*(2026-07-20: ADR-025…029 recorded alongside Part 4 Revision 1 (APPROVED & LOCKED).)*

---

### ADR-030 — Durable, checkpointed, idempotent execution
**Context:** ad-hoc pipeline code loses progress on crashes and risks double side effects on retry. **Decision:** every run **persists state + checkpoints** between stages; workers are stateless; retries are **exactly-once** via **idempotency keys**; recovery **resumes from the last checkpoint** (completed jobs skipped). **Consequences:** crash-safe automation, safe retries, minimal rework; the foundation for reliability. **Status:** Accepted (Part 5 Draft). **Source:** §5, §9, §14.

### ADR-031 — Tenant-fair queues with per-plan concurrency caps
**Context:** a shared queue lets one tenant's backlog starve others. **Decision:** queues are **partitioned per tenant** with **per-plan concurrency caps** and **backpressure**; admission is priority-ordered. **Consequences:** no noisy-neighbor; fair scale; entitlement-aware throughput. **Status:** Accepted (Part 5 Draft). **Source:** §8, §12, §14.

### ADR-032 — Engine-level cost governor is a mandatory control-plane gate
**Context:** cost control must be structural, not per-feature. **Decision:** **no paid job executes** until a control-plane **cost governor** estimates it and enforces **per-video, workspace, and monthly budgets** (ADR-004); over-budget runs are **blocked or downgraded**; retries and provider-switching are **bounded by the same gate**. **Consequences:** the Part 1 $ cap is enforced by construction; no cost runaways. **Status:** Accepted (Part 5 Draft). **Source:** §10, §9.

### ADR-033 — Cost-bounded provider auto-switching with circuit breakers
**Context:** providers fail (down/quota/timeout) and must not take runs down or blow budget. **Decision:** on provider-caused failure, **fall back to the next configured adapter within cost policy** (via the AI Gateway, ADR-005); a **circuit breaker** per provider trips on repeated failures and fails fast to fallback. **Consequences:** resilience to provider outages without runaway cost or silent quality loss. **Status:** Accepted (Part 5 Draft). **Source:** §9, §13.

### ADR-034 — Event-driven triggers & durable scheduler with explicit misfire policy
**Context:** triggers and schedules must be uniform and extensible. **Decision:** all triggers are **event-bus subscriptions** (ADR-007) that start executions; the **scheduler validates + simulates** cadences (next-N fire times + projected cost) before committing and applies an **explicit misfire policy** (skip / run-once-now / backfill) for missed slots. **Consequences:** new triggers are new subscriptions (no new code paths); predictable scheduling. **Status:** Accepted (Part 5 Draft). **Source:** §6, §7.

*(2026-07-20: ADR-030…034 recorded alongside Part 5 (Draft v1.0). Accepted-on-record while Part 5 awaits review; superseding ADR required to change.)*

---

### ADR-035 — Workflows are serializable, versioned DAGs; UI is a view over the definition
**Context:** a future Visual Workflow Builder + Marketplace must not force an engine redesign. **Decision:** workflow definitions are stored as **serializable, versioned DAGs**; any UI (curated template picker in V1, drag-and-drop editor later) is a **view/controller over the same definition**. The schema/APIs must not preclude editing/import/export/clone/diff/simulation. **Consequences:** the Builder (§17.1) and Marketplace (§17.2) are additive; V1 can ship predefined workflows without blocking the editor. **Status:** Accepted (Part 5 Rev 1). **Source:** §17.1, §17.2.

### ADR-036 — Immutable workflow version control (no overwrite)
**Context:** overwriting a workflow risks breaking running automations and losing history. **Decision:** workflow versions are **immutable**; editing creates a **Draft**; **Publish** promotes Draft→Active and demotes the prior Active to history; a workflow has **one Active version**; **in-flight executions pin their version** (never mutated by a publish); Rollback/Restore operate on versions. **Consequences:** safe evolution, full history/diff, no in-flight breakage; foundation for Builder + Marketplace updates. **Status:** Accepted (Part 5 Rev 1). **Source:** §17.4.

### ADR-037 — Explainable, auditable AI Decision Engine
**Context:** automated choices (provider/model/retry/downgrade/pause/approve/switch/cancel) must never be a black box. **Decision:** every automated decision **records** the signals considered, the active Execution Policy, the chosen action, the rejected alternatives, and the cost/quality rationale — to the audit trail and the Execution Visualizer. Decisions never bypass the cost governor (ADR-032) or the paid-run approval rule (Part 1). **Consequences:** trustworthy, debuggable, compliant automation. **Status:** Accepted (Part 5 Rev 1). **Source:** §17.8.

### ADR-038 — Configurable Execution Policies are the Decision Engine's objective function
**Context:** different clients optimize for different goals. **Decision:** named **Execution Policies** (Cost First · Speed First · Quality First · Balanced · Enterprise Custom) are **weightings over (cost, latency, quality, reliability)** that steer provider/model selection, retry aggressiveness, downgrade thresholds, and parallelism; the Decision Engine (ADR-037) uses the active policy as its objective. Policies are config (no hardcoding) and are **always honored within the hard per-video cost cap** (Part 1). **Consequences:** tunable automation without code; cap is inviolable. **Status:** Accepted (Part 5 Rev 1). **Source:** §17.9.

### ADR-039 — Self-healing before human intervention
**Context:** most failures are recoverable and shouldn't page a human. **Decision:** the engine attempts **bounded autonomous recovery** first — automatic retry with intelligent backoff, alternate-provider selection within budget (ADR-033), resource recovery, deadlock/stuck-job detection via deadlines, queue drain/replay — and **escalates to a human only when self-healing is exhausted**. All self-healing steps are decisions (ADR-037): explainable, auditable, cost-bounded (ADR-032). **Consequences:** higher reliability, lower ops load, no runaway cost. **Status:** Accepted (Part 5 Rev 1). **Source:** §17.12.

*(2026-07-20: ADR-035…039 recorded alongside Part 5 Revision 1 (APPROVED & LOCKED).)*

---

### ADR-040 — The content pipeline is format-agnostic
**Context:** Shorts, long-form, Stories, and future social platforms must share one pipeline. **Decision:** **format is config** (aspect ratio, duration, scene budget, pacing) consumed by the same 35-stage pipeline; no per-format pipeline. **Consequences:** new formats/platforms are configuration + a Publishing adapter (ADR-015), never a redesign. **Status:** Accepted (Part 6 Draft). **Source:** §1, §2.

### ADR-041 — Prompts, Visual Styles, and Characters are first-class versioned, governed, reusable assets
**Context:** generation quality depends on prompts/styles/characters that must be reused and governed. **Decision:** **Prompt Templates, Style Packs, and Character records** are first-class assets with **immutable versions, one Active version, approval/governance, and copy-on-use adoption** (ADR-006/036); all render **provider-agnostically** via adapters. **Consequences:** compounding quality, governance, and a future marketplace; consistency across scenes/videos/series. **Status:** Accepted (Part 6 Draft). **Source:** §6, §7, §8.

### ADR-042 — Quality-gated generation with partial-regeneration-first
**Context:** quality must gate automation without wasting cost on full re-runs. **Decision:** the **Quality Engine** scores each output on explainable weighted dimensions (rules + pluggable AI evaluators, ADR-018); failing dimensions trigger the **narrowest regeneration** (partial → full), capped, then **escalate to Manual Review**; per-workspace thresholds decide auto-proceed vs regenerate vs pause; high-stakes dimensions (fact/compliance) force manual gates. **Consequences:** quality enforced cheaply; no black-box auto-publish of low-quality content. **Status:** Accepted (Part 6 Draft). **Source:** §5, §9.

### ADR-043 — Tenant-isolated Content Memory drives generation
**Context:** generations should get smarter using the tenant's own history — without leaking across tenants. **Decision:** a **tenant-isolated** structured+semantic **Content Memory** (past videos, characters, styles, prompt history, winning/failing topics, audience/SEO performance) is read during planning (dedupe/reuse/steer) and written by Continuous Learning post-publish; Memory **never crosses tenants** (Part 5 §12) and its influence on any decision is **auditable** (ADR-037). **Consequences:** compounding quality-per-dollar; strict isolation. **Status:** Accepted (Part 6 Draft). **Source:** §10.

### ADR-044 — Compliance/Safety are explicit pipeline gates
**Context:** policy, brand-safety, and likeness/consent risk must be contained, especially for Kids/News. **Decision:** **Compliance/Safety checks are explicit stages** run **pre-render and pre-publish**; violations **block and notify**; Kids/News/likeness carry stricter defaults; consent/rights (Part 4) are enforced here. **Consequences:** contained legal/brand risk; auditable safety gating. **Status:** Accepted (Part 6 Draft). **Source:** §2, §3.1 (stage 32).

*(2026-07-20: ADR-040…044 recorded alongside Part 6 (Draft v1.0). Accepted-on-record while Part 6 awaits review; superseding ADR required to change.)*

---

### ADR-045 — Multi-format via Format Profiles + repurposing
**Context:** the platform must output to YouTube Long/Shorts, Reels, TikTok, LinkedIn, X, Pinterest, Podcasts, and future networks. **Decision:** a **Format Profile** (config) declares aspect/duration/scene-budget/pacing/caption/audio + the Publishing destination adapter (ADR-015); one source generation **repurposes** into multiple format outputs (re-crop/re-time/re-caption), **reusing pixels where possible** instead of regenerating. **Consequences:** new platforms = a Format Profile + adapter, no pipeline redesign; repurposing is a cost lever. **Status:** Accepted (Part 6 Rev 1). **Source:** §16.1.

### ADR-046 — Tenant-isolated Knowledge Engine (RAG) for grounded generation
**Context:** scripts must be grounded in verifiable knowledge without leaking tenant data. **Decision:** a **tenant-isolated knowledge index** (trusted sources, KB, client docs/PDFs, crawled sites) grounds Research/Fact-Verification via **RAG**, attaching **citations + fact-confidence**, applying **hallucination detection** and **source-freshness** decay; a tenant's knowledge **never** informs another tenant's content (Part 5 §12). **Consequences:** accurate, cited, trustworthy content; strict isolation. **Status:** Accepted (Part 6 Rev 1). **Source:** §16.3.

### ADR-047 — Multi-language as a locale dimension (no pipeline rebuild)
**Context:** content must localize without a parallel pipeline. **Decision:** language/locale is a **dimension**; a generated master **fans out** into localized variants (translated + culturally-adapted script → localized voice → localized subtitle/thumbnail/SEO/regional references) reusing the same pipeline; **English is the default** (Part 1). **Consequences:** multi-language readiness from day one; no redesign to add a language. **Status:** Accepted (Part 6 Rev 1). **Source:** §16.9.

### ADR-048 — Calendar-aware generation
**Context:** generation should align to the publishing calendar, not just run on demand. **Decision:** the **publishing calendar** (holidays, events, series, campaigns, weekly themes, seasonal topics; Part 3 §6) is a **first-class generation input** consumed by Strategy/Topic stages and flowed into prompts + SEO. **Consequences:** timely, campaign-aligned, series-consistent content. **Status:** Accepted (Part 6 Rev 1). **Source:** §16.10.

### ADR-049 — Unified versioned Asset Library (workspace counterpart of the platform Global Asset Library)
**Context:** characters/styles/prompts/music/intros/etc. must be reused and versioned consistently. **Decision:** one **tenant Asset Library** holds characters, backgrounds, music, logos, intros, outros, transitions, voice profiles, prompts, and style packs as **first-class versioned assets** (ADR-041), adoptable from platform masters via **copy-on-use** (ADR-006); reuse cuts cost (master-once) and guarantees consistency. **Consequences:** compounding reuse, consistency across videos/series, marketplace-ready. **Status:** Accepted (Part 6 Rev 1). **Source:** §16.11.

*(2026-07-20: ADR-045…049 recorded alongside Part 6 Revision 1 (APPROVED & LOCKED).)*

---

### ADR-050 — Two disjoint identity planes + non-human identities
**Context:** platform operators and tenant users must never share a permission space, and machines need identities too. **Decision:** identities live in **two disjoint planes** — platform (Owner/Super/Platform/Support/Billing/Security Admin) and tenant (Client Owner/Workspace Admin/Content Manager/Reviewer/Editor/Analyst/Viewer) — that **never overlap**; **service accounts** and **API users** are least-privilege, scoped, rotated machine/API identities with no interactive login; **custom roles** are subsets **within** a plane and can never bridge planes. **Consequences:** separation of duties by construction; operators hold no tenant membership (ADR-002). **Status:** Accepted (Part 7 Draft). **Source:** §2.

### ADR-051 — Approval-based, time-boxed privileged escalation (PAM)
**Context:** elevated access must be exceptional, temporary, and auditable. **Decision:** temporary/elevated permissions require **approval**, **auto-expire**, and are **fully audited** (privileged-access-management); operator access to tenant *data* is **impersonation-only** (ADR-002), never standing. **Consequences:** no permanent super-privileges; every elevation is traceable. **Status:** Accepted (Part 7 Draft). **Source:** §4, §13.2.

### ADR-052 — Immutable, hash-chained audit
**Context:** compliance and incident response require tamper-evident logs. **Decision:** all security-relevant events (login/logout/password/role/permission/secret-access/API/workflow/automation/billing/admin/impersonation) are written to an **append-only, hash-chained** store (no update/delete), **tenant-scoped in visibility**, with configurable **retention + export**. **Consequences:** tamper-evidence, SOC2/ISO evidence base, no cross-tenant audit leakage. **Status:** Accepted (Part 7 Draft). **Source:** §10.

### ADR-053 — Policy-driven authentication hardening
**Context:** a solo creator and an enterprise need different auth strength without different codebases. **Decision:** **MFA/SSO/session-expiry/concurrency/risk-based step-up** are **configurable policy** per role/plan/org; **enterprise SSO = SAML/OIDC + SCIM** on the org tier (ADR-026); risk-based step-up triggers on anomalous login (new geo/device/IP, impossible travel). **Consequences:** enterprise hardening is configuration, not redesign. **Status:** Accepted (Part 7 Draft). **Source:** §3, §6.

### ADR-054 — Full Vault lifecycle for all secrets
**Context:** secrets must be centrally managed, rotated, and audited (leaked dev creds, ISS-C3). **Decision:** all secrets (AI/YouTube/Gmail/future/tokens/certs) live in a **per-tenant, envelope-encrypted Vault** with **rotation, versioning, access policies, health/expiry monitoring, and usage audit**; decryption happens **only in a trusted server context** (never returned to the client); **cross-tenant secret access is impossible** by policy + layout. **Consequences:** production-grade secret management; closes ISS-C3; feeds API Health (Part 4 §20.5). **Status:** Accepted (Part 7 Draft). **Source:** §8.

*(2026-07-20: ADR-050…054 recorded alongside Part 7 (Draft v1.0). Accepted-on-record while Part 7 awaits review; superseding ADR required to change.)*

---

### ADR-055 — Zero Trust across the platform
**Context:** perimeter/location trust is insufficient for a multi-tenant SaaS. **Decision:** **never trust, always verify** — every request re-authenticates the session and re-authorizes the action **server-side**, with **continuous, context-aware** evaluation (identity + device trust + session trust + geo/IP + data classification + risk score) as ABAC conditions; trust can be **revoked mid-session** (step-up MFA or forced logout) on risk signals. **Consequences:** no implicit trust; least-privilege micro-segmentation; enforced by the Security Policy Engine (ADR-056). **Status:** Accepted (Part 7 Rev 1). **Source:** §14.1.

### ADR-056 — Central, versioned Security Policy Engine
**Context:** security policies were scattered across auth/session/API/secret features. **Decision:** a **single engine** holds all policies (password/MFA/session/login/IP/device/API/secret/data-access) as **versioned, audited, one-Active** configs, **evaluated centrally** at every Zero-Trust decision point; inheritance is **platform default → org → workspace, tighten-only** (tenants cannot weaken platform minimums). **Consequences:** policy changes take effect everywhere without code; consistent enforcement; auditable. **Status:** Accepted (Part 7 Rev 1). **Source:** §14.2.

### ADR-057 — Enterprise KMS with BYOK-readiness
**Context:** enterprise/white-label/compliance may require tenant-controlled encryption. **Decision:** Vault envelope encryption (ADR-054) is backed by a **KMS key hierarchy** (root/master → data-encryption keys); **platform-managed keys** are default, **customer-managed keys (BYOK)** are a future per-org option; keys are **rotated, expired, versioned, health-monitored, and audited**. **Consequences:** residency/tenant-controlled-encryption possible without redesign. **Status:** Accepted (Part 7 Rev 1). **Source:** §14.5.

### ADR-058 — Explainable Threat Detection feeding Zero-Trust + Incident Response
**Context:** attacks (brute force, credential stuffing, impossible travel, token/secret abuse, privilege escalation, abnormal automation) must be detected and acted on. **Decision:** rules + behavioral baselines over the **already-audited** signal streams (login/session/API/Vault/automation) emit **explainable alerts** (trigger, evidence, severity, recommended action) that feed the Security Center, **auto-revoke trust** (ADR-055), open **incidents** (§14.6), and notify. Detectors are pluggable. **Consequences:** proactive, explainable defense; closes the loop with Zero Trust and IR. **Status:** Accepted (Part 7 Rev 1). **Source:** §14.7.

### ADR-059 — Break-glass emergency access
**Context:** catastrophic scenarios (total lockout, incident) may require emergency access that must never become a backdoor. **Decision:** a **sealed, multi-approval, time-boxed, alarmed, immutably-audited** break-glass/emergency-admin path; activation raises alerts, grants minimal scoped access for a fixed window, and is **always reviewed post-hoc**. **Consequences:** recoverability without a standing privileged backdoor; every use is traceable. **Status:** Accepted (Part 7 Rev 1). **Source:** §14.10.

*(2026-07-20: ADR-055…059 recorded alongside Part 7 Revision 1 (APPROVED & LOCKED).)*

---

### ADR-060 — Payment processors are adapters routed by region/currency/customer
**Context:** the platform must bill globally (Stripe/Paddle) and in India (Razorpay/GST) and add markets later. **Decision:** payment processors sit behind **one capability interface** (charge/refund/subscribe); the active processor is chosen by **region/currency/customer**; webhooks are **signed + replay-protected** (Part 7 §7). **Consequences:** add/swap a processor by config + adapter, no billing redesign; merchant-of-record (Paddle) is an option for tax simplification. **Status:** Accepted (Part 8 Draft). **Source:** §7.

### ADR-061 — Config-driven, versioned Plans + entitlement engine
**Context:** plans/pricing must change safely and limits must actually enforce. **Decision:** **Plans are versioned data** (entitlements + price points + billing terms + credit grant); **subscribers pin a plan version** (no silent repricing); **entitlements** (quota/boolean/enumerated/tiered) are enforced **server-side before execution** (ADR-004) with a per-entitlement **overage policy** (block / allow+bill / allow+throttle); org→workspace inheritance is tighten-only. **Consequences:** safe repricing, un-bypassable limits, upsell paths. **Status:** Accepted (Part 8 Draft). **Source:** §2, §3.

### ADR-062 — Credits are the shared currency of cost and commerce
**Context:** technical cost control (governor) and commercial billing must not diverge. **Decision:** an **append-only credit ledger** (typed grants — monthly/purchased/promo/bonus — with expiry + config consumption order + refunds) is the **single currency** the Cost Governor (ADR-032) debits via **estimate→reserve→execute→reconcile** (ADR-020); **over-balance blocks or downgrades**, never silent overspend (Part 1). **Consequences:** no overspend and no revenue leakage; one truth for cost + credits. **Status:** Accepted (Part 8 Draft). **Source:** §4, §5.

### ADR-063 — Compliance-grade invoicing & tax
**Context:** invoices/tax must satisfy multi-region compliance. **Decision:** **immutable, sequentially-numbered, downloadable invoices** + **credit notes**, **multi-currency/region**, and **GST/VAT/sales-tax/exempt** via a tax engine or a **merchant-of-record** processor; all records feed audit + compliance (Part 7 §10-11). **Consequences:** compliant billing across markets; audit-ready. **Status:** Accepted (Part 8 Draft). **Source:** §8.

### ADR-064 — Margin-aware commercials
**Context:** a plan must never lose money on AI cost. **Decision:** every plan's **economics (revenue − AI cost)** are modeled **continuously** (Revenue Analytics §10 + Cost Simulator, Part 2 §11.2); the **per-video cost cap (Part 1)** is a **governor-enforced margin floor** (ADR-032). **Consequences:** monetization protects margins by construction; pricing decisions are data-driven. **Status:** Accepted (Part 8 Draft). **Source:** §10, §14.2.

*(2026-07-20: ADR-060…064 recorded alongside Part 8 (Draft v1.0). Accepted-on-record while Part 8 awaits review; superseding ADR required to change.)*

---

### ADR-065 — Profit, not just revenue (Profitability Engine)
**Context:** revenue without cost is a vanity metric; margins must be measurable. **Decision:** the platform models the **full cost stack** (AI/provider/infra/storage/queue/render) against revenue to produce **per-customer, per-plan, per-workspace profitability**; plan pricing is validated against its AI economics; the per-video cost cap (Part 1) is the **governor-enforced margin floor** (ADR-064). **Consequences:** pricing/plan decisions are margin-aware; unprofitable plans are visible. **Status:** Accepted (Part 8 Rev 1). **Source:** §15.1, §15.2.

### ADR-066 — Partner plane isolated from the Tenant plane
**Context:** resellers/partners must monetize accounts without breaching tenant isolation. **Decision:** a **Partner plane** — a distinct identity + commercial space (ADR-050 pattern) for resellers/channel/referral/white-label/regional partners — earns **commission/revenue-share** computed from its accounts; a partner **never** sees another partner's or a tenant's content, only its own accounts' commercial aggregates. **Consequences:** a channel/reseller motion without isolation risk. **Status:** Accepted (Part 8 Rev 1). **Source:** §15.4.

### ADR-067 — Marketplace commerce = entitlement-based delivery
**Context:** the platform will sell credits, templates, prompt/style/voice/automation packs. **Decision:** a purchase **grants an entitlement** (ADR-061) that unlocks the item via **copy-on-use** (ADR-006/028) into the tenant Asset Library (Part 6 §16.11); credit purchases top up the ledger (ADR-062); **revenue-share** flows to creators/partners (ADR-066); reuses the payment/tax/entitlement engines — no new commercial primitives. **Consequences:** marketplace monetization without re-architecture; consistent delivery + isolation. **Status:** Accepted (Part 8 Rev 1). **Source:** §15.5.

### ADR-068 — Central, versioned Commercial Policy Engine
**Context:** commercial rules were scattered across plans/billing/tax/promotions. **Decision:** one **Commercial Policy Engine** holds pricing/discount/promo/tax/credit/refund/renewal/grace/overage rules as **configurable, versioned, audited** policy, **evaluated at every commercial decision** (checkout/invoice/renewal/overage/refund); inheritance platform default → plan/segment/region. Commercial analogue of the Security Policy Engine (ADR-056). **Consequences:** commercial changes are config not code; consistent, auditable enforcement. **Status:** Accepted (Part 8 Rev 1). **Source:** §15.6.

### ADR-069 — Financial Audit Center
**Context:** financial mutations need stronger controls than general audit. **Decision:** all financial events (invoice change, refund, credit, payment failure, revenue correction, tax event, manual adjustment) are recorded **immutable + hash-chained** (ADR-052) in a finance-scoped audit; **manual adjustments and revenue corrections require reason + approval** (separation of duties, §12) and are alarmed. **Consequences:** audit-ready financial controls; dispute + SOC2 evidence base. **Status:** Accepted (Part 8 Rev 1). **Source:** §15.9.

*(2026-07-20: ADR-065…069 recorded alongside Part 8 Revision 1 (APPROVED & LOCKED).)*

---

### ADR-070 — Transactional outbox + idempotent, versioned events
**Context:** an event-driven SaaS must never lose events or double-apply them. **Decision:** a state change and its event(s) commit **atomically via a transactional outbox**, then a relay publishes to the bus; every event carries an **idempotency key + schema version**; consumers **dedupe** (exactly-once effect); ordering is **per-aggregate** (partition by aggregate_id); exhausted handlers **dead-letter**. **Consequences:** no lost/duplicated events; reliable cross-domain integration; foundation for triggers (Part 5), billing (Part 8), analytics. **Status:** Accepted (Part 9 Draft). **Source:** §3.

### ADR-071 — Domain-driven bounded contexts; integrate via events/APIs only
**Context:** ~48 flat prototype tables risk cross-domain coupling. **Decision:** the backend is a set of **bounded contexts**; each entity has **exactly one aggregate-root owner**; other contexts hold **references (IDs), never foreign writes**; cross-aggregate consistency is **eventual via events** (ADR-070), not distributed transactions. **Consequences:** decoupled, independently scalable services; clear ownership. **Status:** Accepted (Part 9 Draft). **Source:** §2.

### ADR-072 — Versioned API surface with uniform standards
**Context:** APIs must evolve without breaking consumers. **Decision:** **all APIs** (REST/internal/service/webhook/streaming/future GraphQL/public/SDK/CLI) are **versioned**; uniform **standards are mandatory** (naming/pagination/filter/sort/errors/validation/rate-limit/idempotency/authN-Z/observability/tracing/audit/deprecation); **tenant scope derives from the auth context, never the client body**. **Consequences:** stable contracts, safe evolution, consistent DX, no tenant spoofing. **Status:** Accepted (Part 9 Draft). **Source:** §5, §6.

### ADR-073 — Provider-abstracted storage/search/cache with tenant-scoped keys
**Context:** storage/search/cache must scale, stay isolated, and allow provider swaps. **Decision:** storage, search, and cache are **adapter-based**, **tenant-prefixed/keyed**, **permission-filtered**, with explicit **lifecycle/retention/invalidation** policies; content-hash caches are immutable; semantic search reuses tenant-isolated embeddings (ADR-046). **Consequences:** swap Supabase→S3/R2, add a search engine or distributed cache, with no redesign; no cross-tenant leakage. **Status:** Accepted (Part 9 Draft). **Source:** §7, §8, §9.

### ADR-074 — Partition + rollup + retention for high-volume data
**Context:** events/usage/audit/api-usage/pipeline-stage data will dominate volume. **Decision:** high-volume tables are **partitioned**, **rolled up** for analytics (ADR-007), and **retention-bounded**; dashboards read **projections/read-models (CQRS where it pays)**, not transactional tables. **Consequences:** dashboards + writes scale to millions of rows without contention. **Status:** Accepted (Part 9 Draft). **Source:** §10, §13.2.

*(2026-07-20: ADR-070…074 recorded alongside Part 9 (Draft v1.0). Accepted-on-record while Part 9 awaits review; superseding ADR required to change.)*

---

### ADR-075 — Data-mesh domain governance (domains are governed data products)
**Context:** without ownership, domains drift and consumers break. **Decision:** every domain declares **owner, steward, data contract, SLA, version policy, consumer rules, and change management**; the owner is accountable for quality/availability, the steward maintains the published **data contract**, and changes must be versioned + backward-compatible (ADR-076); **new domains are pluggable** (register contract + events + APIs) without touching existing ones (ADR-071). **Consequences:** decoupled, accountable, evolvable data ownership. **Status:** Accepted (Part 9 Rev 1). **Source:** §14.1.

### ADR-076 — Safe schema evolution (no breaking change by default)
**Context:** schema changes must not break consumers or require downtime. **Decision:** additive-first; **expand→migrate→contract** (add new, dual-write/backfill, switch reads, remove old) for **zero-downtime**; deprecations carry **sunset windows**; data migrations are **idempotent, resumable, audited** jobs staged via feature rollout (Part 2 §11.3). Data-layer analogue of API versioning (ADR-072). **Consequences:** safe, staged, reversible data evolution. **Status:** Accepted (Part 9 Rev 1). **Source:** §14.2.

### ADR-077 — Event governance via a schema registry
**Context:** ad-hoc events become undocumented coupling. **Decision:** a **schema registry** makes every event a **versioned, owned, documented, discoverable asset**; producers register schemas, consumers discover them, **compatibility is enforced at registration** (backward-compatible within a version, ADR-070); the durable log supports **replay** (new consumers/recovery) and **retention** per class. **Consequences:** no undocumented events; safe evolution; discoverability. **Status:** Accepted (Part 9 Rev 1). **Source:** §14.3.

### ADR-078 — API Gateway is the single external ingress
**Context:** cross-cutting API policy must be enforced once, not per service. **Decision:** an **API Gateway** is the single ingress for external/public traffic — enforcing **authN/authZ, rate limiting, routing, request/response validation + transformation, version routing, logging/monitoring/tracing, and API analytics**; **future services plug in by registering a route** rather than exposing themselves directly. Internal service-to-service traffic may use a lighter internal mesh (ADR-079). **Consequences:** centralized, consistent API policy + observability; safe service growth. **Status:** Accepted (Part 9 Rev 1). **Source:** §14.4.

### ADR-079 — Global Configuration Service + Service Discovery
**Context:** config is scattered and a future microservices topology needs discovery. **Decision:** a **Global Configuration Service** holds all config (platform/tenant/workspace/environment/runtime/feature) as **versioned + audited**, resolved by **layered tighten-only precedence**, emitting `ConfigChanged` → cache invalidation; a **Service Discovery** layer provides registration/discovery/health-checks/routing/failover so a bounded context can be **extracted from the monolith into a service additively** (no redesign). **Consequences:** everything config-driven (Part 1); horizontal scale + HA path. **Status:** Accepted (Part 9 Rev 1). **Source:** §14.7, §14.8.

*(2026-07-20: ADR-075…079 recorded alongside Part 9 Revision 1 (APPROVED & LOCKED). Note: Integration Hub, Data Quality Engine, and Platform Digital Twin operate under existing ADRs 003/018/019 respectively — no new ADR minted; tracked as backlog items.)*

---

### ADR-080 — Workflow mode is a per-run preset over the approval matrix, not an engine mode
**Context:** users must switch Manual ↔ Semi-Auto ↔ Fully-Auto anytime without changing the Automation Engine (Part 5). **Decision:** the three modes are **presets that select a per-stage approval matrix** the **unchanged engine** reads at each gate (Part 3 ADR-013); switching modes changes only the matrix; the workspace-wide **"require approval before any paid stage"** toggle (default ON, Part 1) and **Emergency Stop** always apply. **Consequences:** instant, engine-free mode switching; the engine stays a pure executor; humans are a control surface. **Status:** Accepted (Part 10 Draft). **Source:** §1.

### ADR-081 — Four approval types per stage; Conditional is the intelligent default
**Context:** blanket manual or blanket auto is too coarse. **Decision:** each pipeline stage is **Required / Optional / Auto / Conditional**; **Conditional** pauses **only on signals** — quality score < threshold (Part 6 §5), cost > budget (Part 5 §10), compliance flag (Part 6 §16.7), first-ever run, or new character/style; the matrix lives in the **versioned Workspace Profile** (ADR-012); paid stages default to Required until opted into auto. **Consequences:** maximal automation with humans pulled in only when warranted. **Status:** Accepted (Part 10 Draft). **Source:** §2.

### ADR-082 — Human edits never overwrite; everything is versioned
**Context:** manual edits must be reversible, traceable, and learnable-from. **Decision:** every human edit (script/prompt/storyboard/image/caption/metadata/SEO/thumbnail/schedule/brand-asset) creates a **new immutable version** (like ADR-036/041); the run **pins** the version in use; **rollback** restores a prior version; edits are **audited + attributed** and feed **Content Memory** (Part 6 §10). **Consequences:** full reversibility + audit + learning from human corrections; no lost history. **Status:** Accepted (Part 10 Draft). **Source:** §7.

*(2026-07-20: ADR-080…082 recorded alongside Part 10 (Draft v1.0). Accepted-on-record while Part 10 awaits review; superseding ADR required to change.)*

---

### ADR-083 — Global Approval Policy Engine
**Context:** per-stage approval types (ADR-081) need centralized, attribute-driven policy. **Decision:** a **configurable, versioned, audited approval policy engine** decides approval per stage from attributes — workspace, user role, content type, video length, cost, AI quality, first run, brand risk, compliance, publishing platform (operational analogue of ADR-056/068, tighten-only inheritance); it drives the per-stage matrix (ADR-081) and approval chains (ADR-084). **Consequences:** approvals are policy-driven and consistent, not hardcoded; enterprise-tunable. **Status:** Accepted (Part 10 Rev 1). **Source:** §13.2.

### ADR-084 — Configurable enterprise approval chains
**Context:** enterprises need multi-department sign-off, not a single approver. **Decision:** approval chains are **configurable ordered (or parallel) sequences of approver roles/people** (e.g., Reviewer→Content Manager→Legal→Marketing→Owner→Publish); steps can be **conditional** (policy-driven, ADR-083); rejection **returns** the item with reason; chains bind to stages via the approval matrix, scale solo→enterprise, and are fully audited (extends Part 4 ADR-026). **Consequences:** enterprise governance without a new primitive. **Status:** Accepted (Part 10 Rev 1). **Source:** §13.4.

### ADR-085 — Operational SLAs with pre-breach warnings
**Context:** operations need measurable, proactive service levels. **Decision:** **review/approval/generation/publishing/recovery SLAs** are **configurable targets** measured from event timestamps (Part 9); the system emits **early-warning alerts before violation** (not just on breach) → notifications + escalation (ADR shift mgmt); attainment feeds Operational Analytics, the AIOps pane, and enterprise SLA contracts (Part 8 §11). **Consequences:** proactive operations; SLA accountability. **Status:** Accepted (Part 10 Rev 1). **Source:** §13.6.

### ADR-086 — Unified incident model across security + operations
**Context:** operational and security incidents shouldn't be separate systems. **Decision:** **operational/provider/AI/publishing/cost/workflow** incidents reuse the **Incident Response engine** (Part 7 §14.6) — auto-opened by detections (threat, circuit-breaker, cost overrun, quality failure), each with **detection/severity/owner/timeline (from immutable audit)/resolution/root-cause + a linked playbook** (ADR-087); security and ops share one incident model. **Consequences:** one incident discipline platform-wide; lower MTTR. **Status:** Accepted (Part 10 Rev 1). **Source:** §13.7.

### ADR-087 — Playbooks + read-only Ops Knowledge Assistant
**Context:** operators need repeatable procedures and grounded guidance without risk. **Decision:** reusable **versioned SOP playbooks** (event/incident-triggered, step-guided, steps invoke operational verbs on operator confirm) plus a **read-only, propose-only** Ops Knowledge Assistant (ADR-014 contract) grounded via RAG (ADR-046) on playbooks/SOPs/past-incidents/docs — it recommends actions, surfaces similar incidents and best practices, but **never acts**; the operator confirms. **Consequences:** repeatable operations, faster ramp/MTTR, no unsafe automation of ops actions. **Status:** Accepted (Part 10 Rev 1). **Source:** §13.3, §13.8.

*(2026-07-20: ADR-083…087 recorded alongside Part 10 Revision 1 (APPROVED & LOCKED). Note: AI Operations Center, Workspace Health Score, and Execution Simulation operate under existing ADRs — observability correlation (Part 9 §14.9), explainable scoring (ADR-018), and sandbox/digital-twin (ADR-019 / Part 9 §14.10) — no new ADR minted; tracked as backlog items.)*

---

### ADR-088 — Ecosystem scale is additive composition, not redesign
**Context:** the platform must grow from single-client to a full ecosystem (agencies, enterprises, marketplace, partners, developers, plugins) without rebuilds. **Decision:** every ecosystem capability is **composed from existing primitives** — branding engine (white-label), entitlements + org tier + partner plane (agency/enterprise/reseller), copy-on-use + versioned assets (marketplace/templates), adapters (integrations/AI providers/cloud), policy engines (governance), sandbox/twin (developer/plugin testing), API Gateway (developer platform); reaching each stage requires **configuration, not architectural change**. **Consequences:** ecosystem-scale with zero redesign; the scaling thesis holds. **Status:** Accepted (Part 11 Draft). **Source:** §0, §13.2.

### ADR-089 — Scoped, consented, audited account access for agencies/consultants
**Context:** agencies/consultants must operate in client accounts without the platform-operator impersonation model. **Decision:** managing-party access is **contract/consent-based, scoped, time-bounded, and fully audited** — distinct from operator impersonation (ADR-002); a managing party (agency/consultant) sees **only the clients it manages** and **only permitted data**; the client grants/revokes the relationship. **Consequences:** a legitimate agency motion without breaching tenant isolation or conflating with platform ops. **Status:** Accepted (Part 11 Draft). **Source:** §2, §5.

### ADR-090 — Plugins run sandboxed with declared, least-privilege permissions
**Context:** installable third-party plugins are powerful and dangerous. **Decision:** plugins **declare** the data/events/APIs they need, are **approved + compliance-scanned** before listing, run **sandboxed within their granted scope** (cannot breach tenant isolation, Part 5 §12, or exceed the installing user's rights, Part 7 deny-by-default), attach only at **defined extension points**, and are **versioned with update/rollback** (ADR-036). **Consequences:** safe extensibility; an ecosystem without a security hole. **Status:** Accepted (Part 11 Draft). **Source:** §7.

### ADR-091 — Unified enterprise governance: versioned, audited, inherited policies
**Context:** enterprises need one governance model, not scattered policy toggles. **Decision:** org/compliance/approval/AI/security/retention policies **compose the existing policy engines** (Security ADR-056, Commercial ADR-068, Approval ADR-083, plus AI + Retention) under **one model** with **tighten-only downward inheritance** (org→BU→dept→team→workspace) and **immutable audit** (ADR-052). **Consequences:** enterprise control is configuration; consistent, auditable, inheritable governance. **Status:** Accepted (Part 11 Draft). **Source:** §10.

### ADR-092 — Enterprise-readiness by configuration
**Context:** multi-region, multi-cloud, and regulated verticals must not require rebuilds. **Decision:** **multi-region** = residency config (Part 7 §14.9) + region-routed storage/processing (Part 9 §14.7) + regional BUs; **multi-cloud** = provider-abstracted storage/compute/AI adapters (ADR-003/073) + service discovery (Part 9 §14.8); **gov/healthcare/finance/education** = Zero Trust + KMS/BYOK + immutable audit + classification/DLP + compliance framework (Part 7) with **stricter governance policies** (ADR-091); all reachable via **config + policy + adapter**, never redesign. **Consequences:** the platform is enterprise/regulated-ready by construction. **Status:** Accepted (Part 11 Draft). **Source:** §11.

*(2026-07-20: ADR-088…092 recorded alongside Part 11 (Draft v1.0). Accepted-on-record while Part 11 awaits review; superseding ADR required to change.)*

---

### ADR-093 — Centralized White Label Management
**Context:** per-tenant branding must scale to enterprises with many brands. **Decision:** brands are **first-class versioned assets** (ADR-049) managed in a central White Label Manager with **inheritance** (org→BU→region), **multiple brands per enterprise**, **regional/seasonal** variants resolved by context, and a **draft→validate→preview→approval-chain(ADR-084)→publish→rollback** lifecycle (ADR-036); reuses the branding engine (P6.1) + governance inheritance (ADR-091). **Consequences:** enterprise-grade brand management with no new primitive. **Status:** Accepted (Part 11 Rev 1). **Source:** §14.1.

### ADR-094 — Enterprise AI Governance as a policy type
**Context:** enterprises must govern which AI is used and how. **Decision:** **AI Policy** (approved/blocked models, cost limits, prompt/usage/compliance policies, AI approval workflows) is a policy type in the unified governance model (ADR-091), **enforced** by the AI Gateway (ADR-005) + Cost Governor (ADR-032) + Approval Policy Engine (ADR-083); versioned, audited, inherited tighten-only. **Consequences:** governable AI at enterprise scale without a new engine. **Status:** Accepted (Part 11 Rev 1). **Source:** §14.2.

### ADR-095 — Marketplace governance pipeline
**Context:** a marketplace needs trust + lifecycle, not just listings. **Decision:** every submission passes **publisher verification → security scan (Part 7 §14.4/§16.7) → AI-quality validation (Part 6 §5) → version-compatibility check (ADR-035) → certification** before publish; **ratings/reviews/install-analytics + revenue-share (ADR-066/067) + deprecation lifecycle** apply; reuses partner certification, Quality Engine, compliance, and billing. **Consequences:** a trustworthy marketplace; safe third-party assets. **Status:** Accepted (Part 11 Rev 1). **Source:** §14.3.

### ADR-096 — Global Localization Framework
**Context:** locale handling was spread across parts (language/timezone/currency/residency/holidays). **Decision:** **locale is a first-class cross-platform dimension** (language, timezone, region, currency, local compliance, regional holidays, regional AI policy) resolved by **regional org BUs** (§3) + the config service (Part 9 §14.7), unifying multi-language (Part 6 §16.9), scheduling (Part 5), billing (Part 8 §8), residency (Part 7 §14.9), and calendar (Part 6 §16.10). **Consequences:** consistent enterprise localization; new regions are config. **Status:** Accepted (Part 11 Rev 1). **Source:** §14.9.

### ADR-097 — Enterprise Readiness Certification
**Context:** enterprises need assurance before go-live. **Decision:** a **weighted, explainable** pre-deployment report scores architecture/security/scalability/compliance/cost/AI/operations against the Bible's control base and emits **prioritized remediations**, gating enterprise go-live (enterprise-scale analogue of the workspace Readiness Score, ADR-018 contract; aligns with Architecture Freeze F3 SaaS Readiness). **Consequences:** de-risked enterprise deployments; a repeatable go-live gate. **Status:** Accepted (Part 11 Rev 1). **Source:** §14.10.

*(2026-07-20: ADR-093…097 recorded alongside Part 11 Revision 1 (APPROVED & LOCKED). Note: Developer Experience, Enterprise Migration Center, Enterprise Feature Management, Customer Success Platform, and Platform Intelligence operate under existing ADRs — 019/078, 028, Part 2 §11.3/§11.8, Part 8 §15.7/ADR-087, and ADR-014 — no new ADR minted; tracked as backlog items.)*

---

### ADR-098 — Product Bible governance & evolution
**Context:** the Bible must remain the permanent Source of Truth for 5–10 years as the platform evolves. **Decision:** the Bible evolves **only additively** — **versioned Parts** with explicit **Revisions** (Part 1 Vision wins on any conflict); **append-only ADRs** (a decision changes only via a **superseding ADR**, never edited in place); a **living Migration Backlog** (new parts/revisions append items; nothing discarded); **deprecation with sunset windows + backward compatibility by default** (APIs ADR-072, schema ADR-076, events ADR-077, marketplace ADR-095); and a **Product/Architecture Review process** (new capability → Part/Revision → reconcile against Vision + backlog + ADRs; material architecture change → superseding ADR). The **Architecture Freeze (F1→F4)** is the mandatory gate from specification to implementation. **Consequences:** the Bible stays authoritative, internally consistent, and never silently rewritten as the product grows. **Status:** Accepted (Part 12 Draft). **Source:** Part 12 §9, §12.

*(2026-07-20: ADR-098 recorded alongside Part 12 (Draft v1.0), the final Bible document. Part 12 is a roadmap over the existing architecture — no other new ADR is minted; every future capability it cites maps to an already-recorded ADR/primitive.)*

---

### ADR-099 — Governed AI model lifecycle
**Context:** as AI models evolve, their adoption/retirement must be governed, not ad-hoc. **Decision:** registry models (ADR-003) carry a **lifecycle** (candidate → evaluated → approved → active → deprecated → retired) + a **maturity level**; **promotion** requires an **evaluation/benchmarking** pass (reusing the Quality Engine ADR-042 + Experiment Center Part 2 §11.8) on quality/cost/latency/safety; **retirement/replacement** follow the product lifecycle (ADR-100) with a routing-migration path (ADR-005), existing generations pinning their model version until migrated; all **explainable + policy-driven** (ADR-094). **Consequences:** safe, governed AI evolution without model chaos. **Status:** Accepted (Part 12 Rev 1). **Source:** §13.1.

### ADR-100 — Unified product lifecycle for all artifacts
**Context:** features, APIs, workflows, plugins, and marketplace assets need one consistent lifecycle. **Decision:** every artifact follows **Alpha → Beta → GA → LTS → Deprecated → Sunset → Archived** over the existing versioning/deprecation/release mechanisms (APIs ADR-072, schema ADR-076, events ADR-077, marketplace ADR-095, features Part 2 §11.3, plugins ADR-090), with **backward compatibility + sunset windows + migration guidance** (ADR-098); Alpha/Beta ride staged rollout, LTS gives enterprises extended support, Archived is read-only/removed. **Consequences:** predictable, safe evolution of every artifact class. **Status:** Accepted (Part 12 Rev 1). **Source:** §13.2.

*(2026-07-20: ADR-099…100 recorded alongside Part 12 Revision 1 (APPROVED & LOCKED). Note: Innovation Framework, Competitive Strategy, Sustainability Strategy, Platform Evolution Scorecard, Future Architecture Validation, and Bible Governance cadences operate under existing ADRs — Experiment/Feature-Release/Sandbox (Part 2 §11.8/§11.3, ADR-019), explainable scoring (ADR-018), and Bible governance (ADR-098) — no new ADR minted.)*

---

## ADR log summary
**ADR-001 … ADR-100 recorded** across Product Bible Parts 1–12 (2026-07-20) — **the Product Bible is complete and locked.** ADRs are **append-only**; a decision changes only via a **superseding ADR** (ADR-098). Grouping: 001–010 (Part 2), 011–020 (Part 3), 021–029 (Part 4), 030–039 (Part 5), 040–049 (Part 6), 050–059 (Part 7), 060–069 (Part 8), 070–079 (Part 9), 080–087 (Part 10), 088–097 (Part 11), 098 (Part 12), 099–100 (Part 12 Rev 1). No architectural contradictions remain (Part 12 §12.4 Final Readiness Statement). Next gate: owner-initiated **Architecture Freeze F1→F4**.
