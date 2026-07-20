# Part 9 — Complete Database, API & Event-Driven Architecture (Revision 1)

**Status: APPROVED & LOCKED**
**Version: Revision 1**
**Date: 2026-07-20**

**Version history:**
| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 (Draft) | 2026-07-20 | Awaiting Review | Initial backend: 40+ domains/7 bounded contexts, event architecture + catalog, versioned API + standards, storage/search/cache/observability/governance; 16 deliverables; ADR-070…074; epic M14. |
| **Revision 1** | 2026-07-20 | **APPROVED & LOCKED** | +10 enhancements (§14): Data Mesh & Domain Governance, Schema Evolution Strategy, Event Governance Center, API Gateway, Integration Hub, Data Quality Engine, Global Configuration Service, Service Discovery, Platform Observability Platform, Platform Digital Twin. Domains/events/API/storage/search/cache/observability/governance reconciled. ADR-075…079 added; ISS-P9-R1-01…10 added. Future changes only via explicit **Revision 2**. |

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

---

## 14. Revision 1 — Backend Governance, Gateway & Simulation Enhancements

Revision 1 **adds** the following without removing anything above. Overlaps **improve** existing sections (mappings noted); nothing is duplicated. Theme: make the backend **governed, evolvable, gateway-fronted, integrable, quality-checked, and simulatable** — an enterprise-grade platform substrate.

### 14.1 Data Mesh & Domain Governance
*Strengthens the Database Architecture (§2) — every domain becomes a governed, pluggable data product (ADR-075).*

Every domain (§2.2) now declares a **governance contract**: **Domain Owner · Domain Steward · Data Contract · Domain SLA · Version Policy · Consumer Rules · Change Management.** Architecture: domains are **data products** (data-mesh) — the owner is accountable for its data quality/availability, the steward maintains its **data contract** (the published schema + semantics consumers rely on), the **SLA** sets freshness/availability, and **change management** requires versioned, backward-compatible evolution (§14.2) with **consumer rules** (who may depend, how). **Future domains are pluggable** — a new domain registers its contract + events + APIs without touching existing domains (bounded contexts, ADR-071). See Deliverable **12.13**.

### 14.2 Schema Evolution Strategy
*Improves Aggregate/Naming (§2.3) and Data Governance (§11) — how data models change safely (ADR-076).*

Supports: **Backward Compatibility · Forward Compatibility · Safe Deprecation · Version Evolution · Feature Rollout · Zero-Downtime Migration · Data-Migration Strategy.** Architecture: **no breaking change by default** — additive columns/tables first; **expand→migrate→contract** pattern (add new, dual-write/backfill, switch reads, remove old) enables **zero-downtime**; deprecations carry sunset windows (like APIs §6); schema changes gate through **feature rollout** (Part 2 §11.3) so risk is staged. Data migrations are **idempotent, resumable, auditable** jobs (Part 5). This is the data-layer analogue of API versioning (ADR-072). See Deliverable **12.14**.

### 14.3 Event Governance Center
*Extends Event Architecture (§3) + Catalog (§4) — events become first-class governed assets (ADR-077).*

Supports: **Event Registry · Event Catalog · Event Versioning · Event Ownership · Event Retention · Event Replay · Event Discovery · Event Documentation.** Architecture: a **schema registry** holds every event's versioned schema + owner + docs; producers **register** schemas, consumers **discover** them; **compatibility is enforced** at registration (backward-compatible within a version, ADR-070); **replay** re-emits historical events from the durable log (for new consumers / recovery, extends Part 5 §17.5); **retention** per event class. Every event is a **documented, discoverable, owned asset** — no undocumented/ad-hoc events. See Deliverable **12.15**.

### 14.4 API Gateway Architecture
*Fronts the API Architecture (§5) + Standards (§6) — one enforced entry point (ADR-078).*

An enterprise **API Gateway** providing: **Authentication · Authorization · Rate Limiting · Routing · Request Transformation · API Versioning · Request Validation · Response Transformation · Logging · Monitoring · API Analytics.** Architecture: the gateway is the **single ingress** for external/public API traffic — it enforces authN/authZ (Part 7), rate limits (per-key/tenant/plan), request/response validation + transformation, version routing, and emits logs/metrics/traces (§10) + **API analytics**. **Future services plug into the gateway** (register a route) rather than exposing themselves directly, so cross-cutting policy (security, limits, observability) is enforced **once, centrally**. Internal service-to-service calls may use a lighter internal mesh (§14.8). See Deliverable **12.16**.

### 14.5 Integration Hub
*Formalizes Webhooks/Integrations (§2.2 auto-added domain) into a provider-independent hub.*

Supports: **External APIs · OAuth Integrations · Webhooks · Event Connectors · Import Connectors · Export Connectors · Future Marketplace Integrations.** Architecture: a **connector framework** — inbound (import) and outbound (export/webhook) connectors behind a stable interface, **provider-independent** (like AI/publishing/payment adapters); OAuth integrations managed with tokens in the Vault (Part 7 §8); **event connectors** bridge the internal event bus (§3) to external systems (and vice versa); marketplace integrations (future) install as connectors (copy-on-use, ADR-006). This is where third-party ecosystems attach without touching core domains. See Deliverable **12.17**.

### 14.6 Data Quality Engine
*New cross-cutting layer over all domains; complements Data Governance (§11).*

Supports: **Validation · Duplicate Detection · Consistency Checks · Missing-Data Detection · Drift Detection · Integrity Checks** — with **explainable quality reports.** Architecture: quality rules run as scheduled/triggered jobs (Part 5) across domain data, checking **referential integrity** (aggregate references resolve), **consistency** (event-derived read models match sources), **duplicates/missing/drift** (data-profile baselines), and emit **explainable reports** (what failed, where, severity, remediation) to Observability (§10) + Notifications. Reuses the explainable-scoring contract (ADR-018). Protects the correctness the entire platform depends on. See Deliverable **12.18**.

### 14.7 Global Configuration Service
*Centralizes the config domains (§2.2 System Configuration/Settings) into one versioned service (ADR-079).*

Supports layered config: **Platform · Tenant · Workspace · Environment · Runtime · Feature** configuration. Architecture: a single **configuration service** where all config is **versioned + audited** and resolved by **layered precedence** (platform default → tenant → workspace → environment → runtime override), **tighten-only** where policies apply (Part 7 ADR-056, Part 8 ADR-068). Config changes emit `ConfigChanged` (§4) → cache invalidation (§9) + affected services react. This unifies the routing/policy/plan/flag/setting stores under one contract — everything config-driven (Part 1), nothing hardcoded. See Deliverable **12.19**.

### 14.8 Service Discovery
*New foundation for a future microservices topology; complements the API Gateway (§14.4).*

Supports: **Registration · Discovery · Health Checks · Routing · Failover.** Architecture: services **register** with a discovery layer; callers **discover** healthy instances; **health checks** feed routing (unhealthy instances removed); **failover** reroutes on failure (with circuit breakers, Part 5 ADR-033). The current app can start as a modular monolith; this makes the **evolution to microservices additive** (a bounded context, ADR-071, can be extracted into a service without redesign). Powers horizontal scale + HA (§1). See Deliverable **12.20**.

### 14.9 Platform Observability Platform
*Unifies the observability surfaces (§10 + Part 5 §17.11 + Part 6 §16.12 + Part 7 §14.8 + Part 8 §15.10) into one correlated platform.*

Supports a **unified dashboard** correlating: **Business Metrics · Technical Metrics · AI Metrics · Commercial Metrics · Security Metrics · Workflow Metrics · Provider Metrics** — **everything correlated through one trace.** Architecture: all signals (logs/metrics/traces/events) share the **single end-to-end correlation ID** (§10) so a business event (e.g., a failed publish) can be traced from commercial impact → workflow → job → provider call → log line. This is the *pane of glass* over every prior part's health/analytics center — not a replacement, a **correlation layer** above them. See Deliverable **12.21**.

### 14.10 Platform Digital Twin
*New future-ready simulation of the whole backend; extends the Sandbox/Simulator pattern (Part 5 §17.10, Part 8 §15.8).*

A **Digital Twin** that simulates, in isolation: **Events · APIs · Workflows · Billing · AI Cost · Provider Failures · Queue Saturation · Infrastructure Failures.** Architecture: a modeled replica of the platform's domains/events/flows that runs **what-if scenarios** against historical/synthetic data — chaos-style (inject provider failures, saturate queues, fail infra) and commercial (price/cost changes) — to predict behavior, capacity, cost, and resilience **before** production. **The simulator must never impact production** — fully isolated namespace + mock adapters (ADR-019 pattern). Unifies the Billing Simulator (Part 8 §15.8), Cost Simulator (Part 2 §11.2), Capacity Forecasting (Part 2 §11.9), and Schedule Simulation (Part 5 §6) under one twin. See Deliverable **12.22**.

### 14.11 Deliverable reconciliations (Revision 1)

- **Database Domains (§2)** — every domain now carries a **governance contract** (§14.1) and evolves via the **Schema Evolution Strategy** (§14.2); data correctness watched by the **Data Quality Engine** (§14.6).
- **Event Architecture (§3, §4)** — governed by the **Event Governance Center** (§14.3): registry, versioning, ownership, retention, replay, discovery, docs.
- **API Architecture (§5, §6)** — fronted by the **API Gateway** (§14.4); external ecosystems attach via the **Integration Hub** (§14.5).
- **Storage/Search/Cache (§7-9)** — config resolved by the **Global Configuration Service** (§14.7); cache invalidation driven by `ConfigChanged`.
- **Observability (§10)** — unified into the **Platform Observability Platform** (§14.9), one correlated pane of glass.
- **Data Governance (§11)** — extended by domain governance (§14.1), data quality (§14.6), and simulation/what-if via the **Digital Twin** (§14.10).
- **Scale/HA (§1)** — enabled by **Service Discovery** (§14.8) for a future microservices topology.

### 14.12 Missing-architecture report (Revision 1)
All 10 items are net-new backend-governance/gateway/simulation capabilities vs the prototype, tracked as **ISS-P9-R1-01…10** (§13.4 update). No existing Part-9 functionality removed.

### 14.13 ADR updates (Revision 1)
- **ADR-075** — **Data-mesh domain governance**: every domain is a governed data product (owner/steward/data-contract/SLA/version-policy/consumer-rules/change-management); new domains are pluggable without touching existing ones.
- **ADR-076** — **Safe schema evolution**: no breaking change by default; expand→migrate→contract for zero-downtime; deprecations with sunset windows; idempotent, resumable, audited data migrations staged via feature rollout.
- **ADR-077** — **Event governance via a schema registry**: every event is a versioned, owned, documented, discoverable asset; compatibility enforced at registration; durable replay + retention.
- **ADR-078** — **API Gateway as the single external ingress**: authN/authZ/rate-limit/routing/validation/transformation/observability/analytics enforced centrally; future services plug in via route registration.
- **ADR-079** — **Global Configuration Service + Service Discovery**: all config is versioned/audited and resolved by layered tighten-only precedence emitting ConfigChanged; services register/discover with health-checked routing + failover, enabling additive monolith→microservices evolution.

*(Note: the **Integration Hub §14.5**, **Data Quality Engine §14.6**, and **Platform Digital Twin §14.10** operate under existing ADRs — provider-adapter (ADR-003), explainable evaluators (ADR-018), and sandbox no-side-effects (ADR-019) respectively — so no new ADR is minted for them; they are recorded as backlog items.)*

---

**End of Part 9 — Revision 1 · Status: APPROVED & LOCKED · Version: Revision 1.** Future changes only via an explicit **Revision 2** upgrade. Permanent Source of Truth for the backend architecture; conflicts resolve to Part 1 → … → Part 8. Awaiting the next Bible part.
