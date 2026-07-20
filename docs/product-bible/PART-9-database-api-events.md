# Part 9 — Complete Database, API & Event-Driven Architecture

**Status: Draft (Awaiting Review)**
**Version: 1.0**
**Date: 2026-07-20**

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Parts 3–8 (all Rev 1 Locked). This document is the permanent Source of Truth for the **backend architecture** (data domains, events, APIs, storage, search, cache, observability, governance) once approved. Every future implementation must follow it.

**Relationship to prior parts (no duplication):** Parts 2–8 defined *what* each subsystem does (platform, workspace, onboarding, engine, pipeline, security, commercial). **Part 9 defines the *backend shape* those subsystems share** — the domain/data model, the event bus that connects them, the API surface that exposes them, and the storage/search/cache/observability/governance foundations. It **references** prior ADRs (isolation, provider abstraction, jobs, entitlements, audit, policy engines) as constraints and does not re-specify feature behavior. This is logical architecture only — **no SQL, no schema, no migrations.**

---

## 0. Reading guide
Sections 1–11 are the backend design. Section 12 holds the **16 required deliverables**. Section 13 is governance (missing-architecture report, improvements, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. Backend principles

Support **multi-tenant SaaS · unlimited clients/workspaces · AI automation · cost optimization · event-driven processing · horizontal scaling · high availability · future expansion · zero redesign.** Non-negotiables:
1. **Domain-driven** — the backend is a set of **bounded contexts** with clear ownership; no shared mutable tables across domains (integrate via events/APIs, not cross-domain writes).
2. **Tenant isolation is a data invariant** — every tenant-owned row carries `tenant_id`; access is RLS + application-enforced (Part 5 §12); cross-tenant reads are impossible.
3. **Event-driven integration** — domains communicate through a durable event bus (ADR-007), not direct table coupling → loose coupling + scalability.
4. **Everything config-driven** — plans, policies, routing, features live in config domains, not code (Part 1).
5. **Idempotent + exactly-once** — writes and event handlers are idempotent (Part 5 ADR-030).
6. **Auditable + immutable where it matters** — security/financial events are hash-chained (Part 7 ADR-052, Part 8 ADR-069).
7. **Versioned contracts** — APIs and events are versioned; no breaking change without a new version.
8. **Scale-ready** — partition/rollup high-volume data; stateless services; distributed cache.

---

## 2. Database Architecture (logical)

Logical architecture only — **domains, bounded contexts, aggregates, ownership, relationships, lifecycle, isolation, naming.** Physical schema is deferred to implementation (F4).

### 2.1 Bounded contexts (grouped)
The ~40 domains cluster into **bounded contexts** — each owns its data, publishes/consumes events, and exposes APIs:

| Context | Domains it owns |
|---|---|
| **Platform** | Platform, System Configuration, Feature Releases, Platform Health, Settings (platform-scoped) |
| **Identity & Access** | Identity, Users, Organizations, Tenants, Workspaces, Teams, Permissions, Security, Secrets |
| **Commercial** | Plans, Entitlements, Billing, Payments, Credits, Usage Metering, Marketplace, Partners |
| **Automation** | Workflows, Jobs, Executions, Schedules, Triggers |
| **AI Content** | AI Pipeline, Prompts, Characters, Brand Voice, Style Packs, Templates, Assets, Media Library, Knowledge Base, Content Memory |
| **Distribution** | Publishing, Analytics |
| **Platform Services** | Notifications, Audit, Compliance, Support, Search, (shared) |

### 2.2 Domain specification (why / owns / access / services / publishes / consumes)
Each domain declares the six required facets. Compact form (common rules: **isolation** = tenant-scoped unless "platform"; **access** = via owning service + RBAC Part 7; **audit** = all writes audited):

| Domain | Why it exists | Owns | Scope | Publishes (events) | Consumes |
|---|---|---|---|---|---|
| **Platform** | run YT-Automation | platform brand/config | platform | PlatformSettingChanged | — |
| **Identity** | who is who | identities, credentials, MFA | platform+tenant | UserRegistered, LoginSucceeded/Failed | InvitationAccepted |
| **Organizations** | enterprise tier | orgs, departments, hierarchy | tenant/org | OrgCreated, DepartmentAdded | — |
| **Tenants** | a client account | tenant record, status, lifecycle | tenant | TenantCreated, TenantActivated/Suspended/Archived | ApprovalGranted, PaymentFailed |
| **Workspaces** | a channel/brand workspace | workspace + Workspace Profile (versioned, ADR-012) | tenant | WorkspaceCreated, WorkspaceActivated, ProfileUpdated | — |
| **Users** | member accounts | user profiles, prefs | tenant | UserInvited, UserRemoved, RoleChanged | InvitationAccepted |
| **Teams** | collaboration | teams, membership | tenant | TeamCreated, MemberAdded/Suspended | — |
| **Permissions** | authZ | roles, permissions, grants (custom/temp) | platform+tenant | RoleGranted, PermissionEscalated | — |
| **Plans** | catalog | versioned plans (ADR-061) | platform | PlanPublished, PlanVersioned | — |
| **Entitlements** | limits | per-tenant entitlements + overage policy | tenant | EntitlementChanged, LimitReached | PlanChanged |
| **Billing** | invoices/cycles | invoices, subscriptions, dunning | tenant | InvoiceGenerated, RenewalDue, DunningStarted | PaymentSucceeded/Failed, PlanChanged |
| **Payments** | money movement | payment methods, transactions | tenant | PaymentSucceeded/Failed, RefundIssued | (processor webhooks) |
| **Credits** | AI currency | credit ledger (ADR-062) | tenant | CreditsPurchased/Granted/Debited/Expired | GenerationCompleted, PlanRenewed |
| **Usage Metering** | consumption truth | usage counters/events | tenant | UsageRecorded, QuotaThresholdHit | JobCompleted, PublishSucceeded |
| **Workflows** | recipes | versioned workflow defs (ADR-035/036) | tenant (+platform templates) | WorkflowPublished/Versioned | — |
| **Jobs** | work units | job records, state, checkpoints | tenant | JobQueued/Started/Succeeded/Failed/Retried | TriggerFired |
| **Executions** | runs | execution/run history, timelines | tenant | ExecutionStarted/Completed/Cancelled | JobStateChanged |
| **Schedules** | when | schedules, cadence | tenant | ScheduleDue, ScheduleValidated | — |
| **Triggers** | causes | trigger subscriptions | tenant | TriggerFired | (any domain event) |
| **AI Pipeline** | generation orchestration | pipeline run state (per §Part 6) | tenant | StageStarted/Completed, GenerationCompleted | JobStateChanged |
| **Prompts** | prompt assets | versioned prompt templates (ADR-041) | tenant (+platform) | PromptPublished/Versioned | — |
| **Characters** | identity consistency | character records + refs (ADR-041) | tenant | CharacterCreated/Updated | — |
| **Brand Voice** | voice consistency | brand voice profiles | tenant | BrandVoiceUpdated | — |
| **Style Packs** | visual styles | versioned style packs (ADR-041) | tenant (+platform) | StylePackPublished | — |
| **Templates** | reusable workflows/content | templates (marketplace-ready) | tenant (+platform) | TemplatePublished | — |
| **Assets / Media Library** | reusable media | assets (chars/bg/music/logos/intros…) (ADR-049) | tenant | AssetCreated/Adopted/Deleted | GenerationCompleted |
| **Knowledge Base** | RAG grounding | knowledge index + sources (ADR-046) | tenant | KnowledgeIngested, SourceStale | DocumentUploaded |
| **Content Memory** | learning | tenant-isolated memory (ADR-043) | tenant | MemoryUpdated | LearningCompleted, PublishSucceeded |
| **Publishing** | distribution | publish records, destinations | tenant | PublishScheduled/Succeeded/Failed (VideoPublished) | ExecutionCompleted, ApprovalGranted |
| **Analytics** | performance | rollups, metrics | tenant (+platform aggregate) | AnalyticsRollupReady | PublishSucceeded, (provider metrics) |
| **Notifications** | messaging | notification prefs + outbox | platform+tenant | NotificationSent | (any domain event) |
| **Audit** | traceability | immutable hash-chained log (ADR-052) | platform+tenant | — | (all domains) |
| **Security** | posture | policies, sessions, devices, threats | platform+tenant | SecurityAlert, SessionRevoked | LoginFailed, ThreatDetected |
| **Compliance** | governance | consent, retention, privacy requests, residency | platform+tenant | PrivacyRequestReceived, DataDeleted | — |
| **Secrets** | Vault | encrypted secrets + KMS (ADR-054/057) | tenant (+platform) | SecretRotated, SecretExpiring | — |
| **Settings** | config | tenant/workspace settings | tenant | SettingChanged | — |
| **Marketplace** | commerce | listings, purchases (ADR-067) | platform+tenant | ItemPurchased, ItemPublished | PaymentSucceeded |
| **Partners** | channel | partner accounts, commissions (ADR-066) | partner plane | CommissionAccrued | InvoicePaid |
| **Support** | help | tickets, KB articles, feedback | platform+tenant | TicketCreated/Resolved | — |
| **System Configuration** | platform config | flags, routing, defaults | platform | ConfigChanged | — |
| **Feature Releases** | rollout | release flags, stages (Part 2 §11.3) | platform | FeatureReleased/RolledBack | — |
| **Platform Health** | ops | SLO/health snapshots | platform | HealthDegraded | (telemetry) |

**Auto-added domains (were missing/implicit):**
- **Localization** — languages, locale variants, translations (Part 6 §16.9).
- **Webhooks/Integrations** — outbound webhook endpoints + delivery state (Part 2 §2.5).
- **Idempotency/Outbox** — an outbox + idempotency-key store enabling exactly-once events (transactional outbox pattern, ADR-070).
- **Incidents** — security/commercial/ops incidents (Part 7 §14.6).
- **API Keys/Tokens** — scoped API credentials (Part 7 §7) — a sub-domain of Identity/Secrets.
- **Jobs Dead-Letter** — DLQ store (Part 5 §9).

### 2.3 Aggregates & ownership
- **Aggregate roots** (own their invariants + lifecycle): Tenant, Workspace, User, Organization, Subscription, Invoice, CreditLedger, Workflow, Execution, Job, PipelineRun, Asset, Character, Prompt, StylePack, KnowledgeDoc, PublishRecord, Secret, AuditEntry, Partner, MarketplaceListing.
- **Ownership rule:** exactly **one aggregate root** owns each entity; other contexts hold **references (IDs)**, never foreign writes. Cross-aggregate consistency is **eventual** via events (ADR-007), not distributed transactions.
- **Naming standards:** snake_case tables; `tenant_id` on every tenant-owned aggregate; `id` UUID PKs; `created_at/updated_at`; soft-delete via `deleted_at`; event tables append-only; versioned entities carry `version` + `status` (draft/active/archived). See Deliverable **12.3**.

### 2.4 Isolation & lifecycle
- **Isolation:** RLS on every tenant-owned table (`tenant_id = current_tenant`), platform tables platform-only; partner tables partner-scoped (ADR-066). No cross-tenant/partner reads.
- **Lifecycle:** entities follow domain lifecycles (tenant provisioning→active→suspended→archived→purged, Part 4 ADR-011; workflow draft→active→archived, ADR-036; job queued→…→DLQ, Part 5 §3), with soft-delete → retention window → hard-delete (§11).

See Deliverables **12.1/12.2**.

---

## 3. Event-Driven Architecture

Domains integrate through a durable **event bus** (ADR-007), not table coupling.

**Event classes:**
- **Domain Events** — a fact within a bounded context (e.g., `WorkflowCompleted`); source of truth for that domain.
- **Integration Events** — cross-context facts other domains react to (e.g., `PaymentSucceeded` → Billing/Entitlements).
- **Internal Events** — within a service (in-process), not on the bus.
- **External Events** — inbound (provider/processor webhooks) + outbound (tenant webhooks, Part 2 §2.5).

**Every event defines:** **Producer · Consumer(s) · Payload Ownership · Retry · Idempotency · Ordering · Dead-Letter Strategy.**

**Delivery guarantees (ADR-070):**
- **Transactional outbox** — events are written in the same transaction as the state change, then relayed → **no lost events**.
- **Idempotency** — every event carries an **idempotency key**; consumers dedupe → **exactly-once effect** even on redelivery.
- **Retry + DLQ** — failed handlers retry with backoff; exhausted → **dead-letter** for inspection (Part 5 §9).
- **Ordering** — per-aggregate ordering (partition by `aggregate_id`); global ordering not assumed.
- **Payload ownership** — the producer owns the schema; payloads are **versioned**; consumers tolerate unknown fields (backward-compatible).

See Deliverable **12.4**.

---

## 4. Event Catalog

Authoritative catalog of key events (producer → consumers). Grouped by context; each is versioned (`v1`), idempotent, retryable, DLQ-backed.

| Event | Producer | Key consumers |
|---|---|---|
| **TenantCreated / Activated / Suspended / Archived** | Tenants | Workspaces, Billing, Notifications, Audit |
| **WorkspaceCreated / Activated / ProfileUpdated** | Workspaces | Automation, AI Content, Analytics |
| **UserInvited / InvitationAccepted / UserRemoved / RoleChanged** | Users/Permissions | Identity, Notifications, Audit |
| **LoginSucceeded / LoginFailed / SessionRevoked / SecurityAlert / ThreatDetected** | Identity/Security | Security Center, Incidents, Notifications, Audit |
| **PlanPublished / PlanChanged** | Plans/Billing | Entitlements, Billing, Notifications |
| **EntitlementChanged / LimitReached / QuotaThresholdHit** | Entitlements/Usage | Automation (gating), Notifications |
| **CreditsPurchased / CreditsGranted / CreditsDebited / CreditsExpired** | Credits | Cost Governor, Billing, Notifications |
| **PaymentSucceeded / PaymentFailed / RefundIssued** | Payments | Billing, Entitlements, Notifications, Financial Audit |
| **InvoiceGenerated / RenewalDue / DunningStarted** | Billing | Notifications, Revenue Analytics, Financial Audit |
| **ScheduleDue / TriggerFired** | Schedules/Triggers | Automation Engine |
| **WorkflowStarted / WorkflowCompleted / WorkflowFailed** | Workflows/Executions | AI Pipeline, Analytics, Notifications |
| **JobQueued / JobStarted / JobSucceeded / JobFailed / JobRetried / JobDeadLettered** | Jobs | Executions, Observability, Cost Governor |
| **StageStarted / StageCompleted / GenerationCompleted** | AI Pipeline | Credits (debit), Quality, Content Memory |
| **ProviderFailed / ProviderSwitched / CircuitBreakerTripped** | AI Gateway | Threat/Health, Cost Governor, Notifications |
| **QualityScored / RegenerationTriggered** | Quality Engine | Pipeline, Human Review |
| **ApprovalRequested / ApprovalGranted / ApprovalRejected** | Human Review | Automation, Notifications, Audit |
| **AssetCreated / AssetAdopted / PromptPublished / StylePackPublished / CharacterUpdated** | AI Content | Asset Library, Marketplace |
| **KnowledgeIngested / SourceStale / MemoryUpdated / LearningCompleted** | Knowledge/Memory | Pipeline, Insights |
| **PublishScheduled / VideoPublished / PublishFailed** | Publishing | Analytics, Usage, Notifications, Learning |
| **AnalyticsRollupReady** | Analytics | Dashboards, Insights, Revenue/Profitability |
| **SecretRotated / SecretExpiring** | Secrets | API Health, Notifications, Security |
| **PrivacyRequestReceived / DataExported / DataDeleted** | Compliance | Audit, Notifications |
| **ItemPurchased / ItemPublished / CommissionAccrued** | Marketplace/Partners | Billing, Entitlements, Partners |
| **FeatureReleased / RolledBack / ConfigChanged** | Feature Releases/System Config | affected services, Audit |
| **HealthDegraded / IncidentOpened / IncidentResolved** | Platform Health/Incidents | Ops, Notifications |
| **TicketCreated / TicketResolved / FeedbackSubmitted** | Support | Notifications, Analytics |

See Deliverable **12.5**. (Catalog is extensible — new domains register events without redesign.)

---

## 5. API Architecture

A future-proof, versioned API surface.

| API type | Purpose | Audience |
|---|---|---|
| **REST** | primary resource API | frontend, integrations |
| **Internal APIs** | frontend↔backend (server actions/BFF) | first-party app |
| **Service APIs** | service↔service (internal) | backend services |
| **Webhook APIs** | outbound events to tenant systems + inbound provider/processor webhooks | integrators |
| **Streaming APIs** | live timelines/logs/progress (SSE/WebSocket) | live dashboards (Part 3 §19.1, Part 5 §17.3) |
| **Future GraphQL** | flexible querying | future integrators |
| **Future Public API** | third-party developer platform | external devs (Part 2 §2.5) |
| **Future SDKs / CLI** | client libraries + command line | developers |

**Every API is versioned** (`/v1/…`); no breaking change without a new major version (§6 deprecation policy). See Deliverable **12.6**.

---

## 6. API Standards

Uniform contract for every API (Deliverable 12.7):

| Concern | Standard |
|---|---|
| **Naming** | resource-oriented, plural nouns, kebab/snake consistent; verbs only for actions (`/runs/{id}:cancel`) |
| **Versioning** | URI major version `/v1`; additive within a version; breaking → `/v2` |
| **Pagination** | cursor-based (stable under writes); `page_size` capped |
| **Filtering / Sorting** | explicit allowlisted fields; deny arbitrary queries |
| **Errors** | structured (code, message, details, correlation_id); consistent HTTP status |
| **Validation** | schema-validated requests; reject unknown/invalid; entitlement-checked (ADR-004) |
| **Rate Limiting** | per-key/tenant/plan (Part 7 §7); `429` + retry-after |
| **Idempotency** | `Idempotency-Key` header on writes → exactly-once (ADR-030) |
| **AuthN / AuthZ** | token/OAuth (Part 7); deny-by-default; API scope ≤ owner scope |
| **Observability / Tracing** | correlation ID + request ID on every call; distributed tracing (§9) |
| **Audit** | every state-changing call audited (Part 7 §10) |
| **Deprecation / Compatibility** | deprecation headers + sunset dates; backward-compatible within a major; changelog |

**Multi-tenancy:** every request is tenant-scoped from the auth context; no tenant ID is trusted from the client body. See Deliverable **12.7**.

---

## 7. File Storage Architecture

Tenant-isolated object storage for all binary/large data.

**Data classes → buckets/prefixes** (all tenant-prefixed, private by default — closes ISS-C2): Images · Videos · Audio · Generated Assets · Brand Kits · Templates · Characters · Voices · Documents · Logs · Reports · Backups · Temporary Files · Cache.

**Architecture:**
- **Provider-abstracted** (storage adapter, Part 3 ADR-006/ISS-E4) — Supabase Storage now, S3/R2 future, no redesign.
- **Isolation** — per-tenant prefixes + signed, time-boxed URLs; never public (Part 5 §12); classification-driven access (Part 7 §14.3).
- **Lifecycle / Retention / Archival** — hot (recent) → warm → cold/archive by policy; temp/cache auto-expire; backups encrypted (Part 7 §14.10); retention per data class + compliance (§11).
- **Provenance** — every artifact records producing run/job (Part 5) for traceability. See Deliverable **12.8**.

---

## 8. Search Architecture

Layered search over tenant-isolated data.

| Search | Over | Tech direction |
|---|---|---|
| **Workspace Search** | workspace entities (plans/videos/assets) | indexed keyword |
| **Automation Search** | workflows/jobs/executions | indexed keyword + filters |
| **Asset Search** | Asset Library (chars/styles/media) | keyword + metadata + tags |
| **Knowledge Search** | Knowledge Base (RAG) | semantic (embeddings, ADR-046) |
| **Global Search** | across a tenant's domains | federated + permission-filtered |
| **Semantic Search (future)** | cross-entity meaning | embeddings/vector index |

**Rules:** every search is **tenant-scoped + permission-filtered** (a user only finds what they may see); semantic search reuses the tenant-isolated embedding store (Content Memory/Knowledge, Part 6). See Deliverable **12.9**.

---

## 9. Caching Architecture

Multi-layer caching with explicit invalidation.

| Cache | Holds | Invalidation |
|---|---|---|
| **Platform Cache** | platform config/flags | on ConfigChanged/FeatureReleased |
| **Workspace Cache** | Workspace Profile, settings | on ProfileUpdated/SettingChanged |
| **Configuration Cache** | routing/policies/plans | on PlanPublished/ConfigChanged (policy engines) |
| **Provider Cache** | provider/model metadata, health | TTL + on ProviderFailed |
| **Prompt Cache** | prompt results by content hash (Part 6) | content-hash keyed (immutable) |
| **Asset Cache** | resolved asset URLs/metadata | on AssetCreated/Deleted |
| **Analytics Cache** | rollup query results | on AnalyticsRollupReady |
| **Distributed Cache** | shared hot data across nodes | event-driven + TTL |

**Invalidation strategy:** **event-driven** (cache subscribes to the relevant domain events) + **TTL** fallback; content-hash caches (prompt/result) are immutable (never invalidated, only expired). Tenant data is cache-key-scoped by `tenant_id` (no cross-tenant leakage). See Deliverable **12.10**.

---

## 10. Observability Architecture

Unified observability across the backend (consolidates Part 5 §11, Part 6 §12, Part 7 §14.8, Part 8 §15.10).

**Signals:** Logs · Metrics · Tracing · Correlation · Request Flow · Performance Monitoring · Latency · Error Tracking · Event Tracking · Provider Monitoring · API Monitoring.

**Architecture:**
- **Correlation IDs** — a single correlation ID threads a request → API → jobs → events → provider calls → logs (end-to-end traceability).
- **Structured logs + metrics + distributed traces** — every service emits all three; tenant/run/job IDs on every record.
- **Event tracking** — event bus is observable (lag, DLQ depth, throughput).
- **Provider + API monitoring** — latency/error/cost per provider (Part 2 §11.4) and per API endpoint.
- **Rollup-backed** dashboards (ADR-007) feed all the health/analytics surfaces defined in prior parts. See Deliverable **12.11**.

---

## 11. Data Governance

Lifecycle + compliance for all data (realizes Part 7 §11 + §14.9).

**Capabilities:** Ownership · Retention · Versioning · Soft Delete · Hard Delete · Archival · Recovery · Data Lineage · Data Residency · Compliance.

**Architecture:**
- **Ownership** — every datum belongs to an aggregate + tenant/org/partner (§2.3); classification-tagged (Part 7 §14.3).
- **Retention** — policy per data class (Commercial/Security Policy engines); enforced by lifecycle jobs.
- **Versioning** — versioned aggregates (workflows/prompts/styles/plans/policies) keep immutable history.
- **Soft → Hard delete** — soft-delete (`deleted_at`) → retention window → hard-delete; right-to-delete honored (Part 7 §14.9) within legal-hold constraints.
- **Archival / Recovery** — cold archival + backup/restore (Part 7 §14.10) with defined RPO/RTO.
- **Data Lineage** — provenance from source (Knowledge/upload) → generation → artifact → publish (Part 6) is traceable.
- **Data Residency** — region config (Part 7 §14.9) routes storage/processing per org. See Deliverable **12.12**.

---

## 12. Required Deliverables

1. **Database Domain Architecture** — §2.2 (40+ domains, six facets each) + auto-added domains.
2. **Bounded Context Map** — §2.1 (7 contexts grouping the domains; integrate via events/APIs only).
3. **Aggregate Ownership** — §2.3 (aggregate roots, one-owner rule, references-not-foreign-writes, naming).
4. **Event Architecture** — §3 (classes, per-event contract, outbox + idempotency + retry + DLQ + ordering, ADR-070).
5. **Event Catalog** — §4 (full producer→consumer catalog, versioned/idempotent/DLQ-backed).
6. **API Architecture** — §5 (REST/internal/service/webhook/streaming + future GraphQL/public/SDK/CLI; all versioned).
7. **API Standards** — §6 (naming/versioning/pagination/filter/sort/errors/validation/rate-limit/idempotency/authN-Z/observability/audit/deprecation).
8. **Storage Architecture** — §7 (provider-abstracted, tenant-isolated, lifecycle/retention/archival, provenance).
9. **Search Architecture** — §8 (workspace/automation/asset/knowledge/global/semantic; tenant-scoped + permission-filtered).
10. **Cache Architecture** — §9 (layers + event-driven/TTL invalidation; tenant-scoped keys).
11. **Observability Architecture** — §10 (logs/metrics/traces/correlation/event/provider/API monitoring).
12. **Data Governance** — §11 (ownership/retention/versioning/soft-hard-delete/archival/recovery/lineage/residency/compliance).
13. **Missing Architecture Report** → §13.1.
14. **Future Improvement Suggestions** → §13.2.
15. **ADR Updates** → §13.3.
16. **Migration Backlog Updates** → §13.4.

---

## 13. Governance

### 13.1 Missing Architecture Report (found while designing Part 9)
1. **Domain-driven bounded contexts** — the prototype has ~48 flat tables without explicit domain ownership/boundaries; cross-domain coupling risk (ISS-P9-01).
2. **Event bus + transactional outbox + idempotency store** — no durable event backbone (needed by Part 5 triggers, Part 8 billing, all integrations; extends ISS-P2-12) (ISS-P9-02).
3. **Complete event catalog + versioned event contracts** — no defined events (ISS-P9-03).
4. **Versioned API surface + API standards** — no formal versioned API/standards; internal-only today (ISS-P9-04).
5. **Streaming APIs** — live timeline/logs need SSE/WebSocket infra (Part 3 §19.1, Part 5 §17.3) (ISS-P9-05).
6. **Provider-abstracted storage + lifecycle/retention/archival** — single provider, public bucket issue (ISS-C2/E4 deepened) (ISS-P9-06).
7. **Search layer** (workspace/asset/knowledge/global/semantic, permission-filtered) — none (ISS-P9-07).
8. **Multi-layer caching + event-driven invalidation** — only ad-hoc prompt cache today (ISS-P9-08).
9. **Unified observability** (correlation IDs end-to-end, distributed tracing, event/provider/API monitoring) (ISS-P9-09).
10. **Data governance engine** (retention/soft-hard-delete/lineage/residency/recovery) beyond current soft-delete (ISS-P9-10).
11. **Missing domains** — Localization, Webhooks/Integrations, Outbox/Idempotency, Incidents, API-Keys, DLQ as first-class stores (ISS-P9-11).
12. **Partition + rollup strategy** for high-volume tables (events/usage/audit/pipeline-stages/api-usage) at scale (extends ADR-007) (ISS-P9-12).

**Already tracked (referenced):** event bus/webhooks (ISS-P2-12), Queue/Job Manager (ISS-P2-05), durable runtime (M11), analytics rollups (ADR-007), private asset bucket (ISS-C2), storage adapter (ISS-E4), per-tenant Vault (ISS-B2/M3), tenant isolation (Part 5 §12), audit immutability (Part 7 ADR-052), current 48-table prototype (PAD).

### 13.2 Future Improvement Suggestions
1. **Adopt DDD bounded contexts now** — draw domain boundaries before implementation so services stay decoupled and independently scalable; integrate via events, never shared writes.
2. **Transactional outbox from day one** — the single most important reliability primitive for an event-driven SaaS (no lost events, exactly-once effects).
3. **Everything versioned** — APIs, events, workflows, prompts, plans, policies — so nothing breaks consumers on change.
4. **Partition + rollup high-volume data early** — events/usage/audit/api-usage/pipeline-stages will dominate volume; design partitioning + retention before scale.
5. **One correlation ID end-to-end** — request → job → event → provider → log; makes debugging and observability tractable.
6. **Storage + search + cache as provider-abstracted services** — swap Supabase→S3/R2, add a search engine, add a distributed cache, all without redesign.
7. **Governance as a cross-cutting engine** — retention/lineage/residency/delete driven by classification (Part 7) + policy engines, applied uniformly across domains.
8. **Read models / CQRS where it pays** — heavy analytics/dashboards read from rollup projections, not transactional tables, protecting write performance.

### 13.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-070** — **Transactional outbox + idempotent, versioned events**: state changes and their events commit atomically (outbox); every event carries an idempotency key + version; consumers dedupe (exactly-once effect); per-aggregate ordering; exhausted handlers dead-letter.
- **ADR-071** — **Domain-driven bounded contexts, integrate via events/APIs only**: each context owns its data (one aggregate root per entity); no cross-domain foreign writes; cross-aggregate consistency is eventual via events.
- **ADR-072** — **Versioned API surface with uniform standards**: all APIs (REST/internal/service/webhook/streaming/future) are versioned; standards (pagination/errors/idempotency/rate-limit/authZ/tracing/audit/deprecation) are mandatory; tenant scope from auth, never client body.
- **ADR-073** — **Provider-abstracted storage/search/cache with tenant-scoped keys**: storage, search, and cache are adapter-based, tenant-prefixed/keyed, permission-filtered, with lifecycle/retention/invalidation policies; swap providers without redesign.
- **ADR-074** — **Partition + rollup + retention for high-volume data**: events, usage, audit, api-usage, and pipeline-stage data are partitioned, rolled up for analytics, and retention-bounded; dashboards read projections, not transactional tables.

### 13.4 Migration Backlog updates
Items **ISS-P9-01 … ISS-P9-12** added under new epic **M14 (Backend Architecture — domains, events, APIs, storage, search, cache, observability, governance)**, which underpins all other epics (M8–M13 build on it); cross-links M1 (isolation), M11 (engine/events), M8 (platform consoles). See `MIGRATION-BACKLOG.md`.

---

**End of Part 9 — Status: Draft (Awaiting Review) · Version 1.0.** Not locked. Permanent Source of Truth for the backend architecture once approved; conflicts resolve to Part 1 → … → Part 8. Awaiting owner review → then the next Bible part.
