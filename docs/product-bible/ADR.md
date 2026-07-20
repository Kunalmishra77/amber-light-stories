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
