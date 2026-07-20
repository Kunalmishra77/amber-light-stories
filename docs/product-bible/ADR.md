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
