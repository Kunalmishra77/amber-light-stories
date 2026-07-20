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
