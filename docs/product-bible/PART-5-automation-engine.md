# Part 5 — Complete Automation Engine Architecture (Revision 1)

**Status: APPROVED & LOCKED**
**Version: Revision 1**
**Date: 2026-07-20**

**Version history:**
| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 (Draft) | 2026-07-20 | Awaiting Review | Initial engine: vocabulary, lifecycle, workflow/job/scheduler/trigger/execution engines, failure recovery, cost governor, isolation, provider abstraction; 16 deliverables; ADR-030…034; ISS-P5-01…12; epic M11. |
| **Revision 1** | 2026-07-20 | **APPROVED & LOCKED** | +12 enhancements (§17): Visual Workflow Builder, Automation Marketplace, Execution Visualizer, Automation Version Control, Smart Queue Management, Worker Management Center, Cost Governor Dashboard, AI Decision Engine, Execution Policies, strengthened Sandbox Automation, Platform-wide Automation Health, Self-Healing Automation. Lifecycle/engines/matrices reconciled. ADR-035…039 added; ISS-P5-R1-01…12 added. Future changes only via explicit **Revision 2**. |

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Part 3 (Client Experience & Workspace, Rev 1 Locked) · Part 4 (Onboarding, Rev 1 Locked). This document is the permanent Source of Truth for the **Automation Engine** once approved.

**Relationship to prior parts (no duplication):** Part 3 §7 defined the 20-stage content pipeline and §19.11 (ADR-017) established the **Workflow-Driven Architecture** — *jobs & workflows are the product; UI only visualizes/controls them.* Part 5 is the **engineering specification of that principle**: the runtime that executes those jobs/workflows reliably, scalably, cheaply, and in isolation. It references Part 3's pipeline as *the canonical workflow* and Part 2's Queue/Job Manager (§2.3, ISS-P2-05) and AI Gateway (ADR-005) as platform surfaces this engine powers. It does not re-specify the pipeline stages.

---

## 0. Reading guide
Sections 1–14 are the engine design. Section 15 holds the **16 required deliverables**. Section 16 is governance (missing-feature report, improvements, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. Design principles (the engine's contract)

The Automation Engine is the **brain** of YT-Automation. Every capability in the platform runs through it. Non-negotiable properties for **every** automation:
1. **Observable** — real-time state, logs, cost, artifacts (§11).
2. **Recoverable** — resume from the last checkpoint after any failure (§9).
3. **Retryable** — idempotent retries with backoff; no double side effects (§9).
4. **Cost-aware** — every run is estimated, capped, and metered (§10; Part 1 $ cap).
5. **Provider-agnostic** — no workflow depends on a specific provider (§13; ADR-003/005).
6. **Multi-tenant** — hard isolation of jobs, logs, queues, credentials (§12).
7. **Secure** — least-privilege execution, encrypted secrets, audited actions (§12, §17-ref).
8. **Extensible** — new jobs/workflows/providers drop in via config, not redesign (§4, §13).

---

## 2. Common vocabulary (platform-wide canonical terms)

| Term | Definition |
|---|---|
| **Automation** | Any configured, self-running unit of work in a workspace (a bound *workflow + trigger + schedule* that produces an outcome, e.g. "daily short video"). |
| **Workflow** | A **definition** (DAG) of stages/jobs with control flow (sequential/parallel/conditional). Versioned, reusable, template-able. The *recipe*. |
| **Job** | The atomic **unit of executable work** (one capability, e.g. Voice Job). Has a uniform lifecycle, inputs/outputs, cost, logs. The *product primitive* (ADR-017). |
| **Stage** | A **position within a workflow** occupied by one job (or a fan-out of jobs). "Scene Planning stage." |
| **Task** | A **sub-unit inside a job** (e.g. "generate image for scene 3"). Jobs may fan out into many tasks. |
| **Trigger** | The **cause** that starts an execution (time/manual/webhook/event…). §7. |
| **Schedule** | A **time policy** describing when triggers fire (cron/daily/recurring…). §6. |
| **Queue** | An **ordered buffer** of ready work awaiting a worker; priority + tenant-partitioned. §later. |
| **Worker** | A **compute unit** that pulls jobs from a queue and executes them. Stateless, horizontally scalable. |
| **Pipeline** | A concrete **content workflow** — specifically Part 3 §7's 20-stage flow. (A pipeline *is* a workflow; "pipeline" is the domain name for the content one.) |
| **Execution** | A specific **workflow definition being run** (an instance of a workflow). |
| **Run** | Synonym for an execution instance; a single pass of a workflow/job (has a run-id, start/end, result). |
| **Retry** | A **re-attempt** of a failed job/task, idempotent, with backoff and a retry count. |
| **Rollback** | **Undoing** a job's side effects to return to a prior consistent state. |
| **Checkpoint** | A **saved recoverable state** between stages so a run resumes without redoing completed work. |
| **DLQ (Dead-Letter Queue)** | Where **exhausted/poison** jobs land for inspection after all retries fail. |
| **Idempotency key** | A stable key making a job's effect **exactly-once** under retries. |
| **Artifact** | A **produced output** (script, image, clip, audio, video, thumbnail) stored per-tenant. |

This vocabulary is authoritative for all Bible parts and future code.

---

## 3. Automation Lifecycle

Every automation/run moves through this state machine. States extend Part 3 ADR-017's job lifecycle with the operational states requested.

```
Created ─► Validated ─► Queued ─► Waiting ─► Running ─┬─► Paused ─► Manual Review ─┐
                                                      │                            │
                                                      ├─► Retrying ────────────────┤
                                                      │                            ▼
                                                      ├─► Succeeded ─► Completed ─► Archived ─► (Restored)
                                                      │
                                                      ├─► Cancelled
                                                      └─► Failed ─► Dead Letter Queue ─► (Restored / Cancelled)
```

| State | Meaning |
|---|---|
| **Created** | Automation/run defined but not yet checked. |
| **Validated** | Passed pre-flight (inputs present, credentials healthy, entitlements/budget OK). |
| **Queued** | Admitted to a tenant-partitioned queue at its priority. |
| **Waiting** | Blocked on a dependency, schedule slot, upstream job, or manual gate. |
| **Running** | A worker is actively executing the current job/stage. |
| **Paused** | Halted deliberately (emergency stop, manual-mode gate) — resumable. |
| **Manual Review** | Awaiting a human decision (approve/reject/edit/regenerate) at a gate. |
| **Retrying** | A failed job is re-attempting under the retry policy (backoff). |
| **Succeeded** | The current job/stage produced a valid output. |
| **Completed** | The whole workflow finished successfully end-to-end. |
| **Archived** | Completed run moved to cold retention (still queryable). |
| **Restored** | An archived/DLQ/cancelled run brought back to an actionable state. |
| **Cancelled** | Stopped by user/system before completion; side effects rolled back. |
| **Failed** | A job exhausted retries or hit a fatal error. |
| **Dead Letter Queue** | Terminal-until-inspected holding area for failed/poison jobs. |

**Auto-added states:** **Scheduled** (validated + waiting for a future time slot — distinct from Queued), **Timed-Out** (a running job exceeded its deadline → routed to Retrying or Failed), **Skipped** (a conditional branch not taken), **Superseded** (a newer run replaced this one, e.g. re-plan). See Deliverable **15.2**.

---

## 4. Workflow Engine

A configurable engine that executes **workflow definitions** (DAGs). Capabilities:
- **Sequential · Parallel · Conditional · Branching · Merge points** — full control-flow (fan-out/fan-in with join semantics).
- **Nested workflows** — a stage can invoke a sub-workflow (composition).
- **Reusable & Template workflows** — shared definitions; the content pipeline (Part 3 §7) is the built-in template.
- **Versioned workflows** — definitions are immutable versions; a running execution pins its version (upgrades don't mutate in-flight runs).
- **Scheduled · Recurring** — bound to the Scheduler (§6).
- **Manual · Automatic · Hybrid** — per-stage execution policy (§9; Part 3 ADR-013).
- **Future marketplace workflows** — third-party/community definitions installable via entitlements + copy-on-use (Part 2 §11, ADR-006).

**Everything configurable, nothing hardcoded** (Part 1). A workflow definition declares: stages, the job per stage, control flow/conditions, per-stage mode (manual/auto), retry/timeout policy, and cost tier. See Deliverable **15.3**.

---

## 5. Job Engine (the universal primitive)

**Every action in the platform is a Job** (ADR-017). Canonical jobs (extends Part 3's list): Research · Planning · Script · Prompt · Image · Animation · Voice · Subtitle · Music · Rendering · Thumbnail · SEO · Publishing · Analytics · Notification · Cleanup · Backup · Export · Validation · Approval · Health-Check · Synchronization · (+ future jobs).

Each job defines a uniform contract:

| Facet | Specification |
|---|---|
| **Lifecycle** | the §3 states (queued→running→…→succeeded/failed/DLQ). |
| **Priority** | numeric class (e.g. interactive > scheduled > batch); drives queue ordering. |
| **Dependencies** | upstream jobs/artifacts required before it can run. |
| **Timeouts** | per-job deadline → Timed-Out handling. |
| **Retries** | max attempts, backoff strategy, idempotency key. |
| **Cancellation** | cooperative cancel + rollback of partial side effects. |
| **Resuming** | resume from checkpoint (skip completed tasks). |
| **Versioning** | job implementation version recorded per run. |
| **Ownership** | tenant + workspace + initiating user (isolation + audit). |
| **Audit** | every transition logged (actor, time, result, cost). |

Jobs are **stateless in the worker, stateful in the store** — worker crashes never lose progress (state + checkpoints persisted). See Deliverable **15.4**.

---

## 6. Scheduler

Enterprise scheduling that emits time-triggers (§7). Supports: **One-time · Daily · Weekly · Monthly · Custom Cron · Timezone-aware · Holiday rules (future) · Business hours · Retry windows · Delayed execution · Recurring campaigns · Bulk scheduling · Schedule validation · Schedule simulation.**

**Behavior:**
- **Timezone-anchored** to the Workspace Profile timezone (Part 3/4).
- **Schedule validation** rejects impossible/conflicting cadences before they run; **simulation** shows the next N fire times + projected cost (ties to the Estimator, Part 3 §19.6) **before** committing.
- **Retry windows / business hours** constrain when retries and publishes may occur.
- **Bulk + recurring campaigns** schedule many items at once (seasonal campaigns, Part 3 §6).
- Missed slots follow a **misfire policy** (skip / run-once-now / backfill) — an auto-added requirement. See Deliverable **15.5**.

---

## 7. Trigger Engine

| Trigger | Fires when… |
|---|---|
| **Time** | the Scheduler reaches a slot (§6). |
| **Manual** | a user starts a run/stage. |
| **Webhook** | an external system posts to a tenant webhook (Part 2 §2.5). |
| **API** | a public-API call requests a run (Part 2 §2.5). |
| **Approval** | a manual-review gate is approved → continues the run. |
| **Subscription** | a plan/entitlement change (activate/suspend) starts/stops automations. |
| **Workspace** | a lifecycle transition (activated → enable automations; suspended → halt). |
| **Publishing** | a publish completes → triggers Analytics/next-part jobs. |
| **Retry** | a retry policy re-enqueues a failed job. |
| **Health** | a health check result triggers remediation/notification. |
| **Failure** | a failure triggers recovery/escalation flows. |
| **Future event triggers** | any domain event on the bus (ADR-007) can trigger a workflow. |

Triggers are **event-driven** (reuse the platform event bus, ADR-007) so new triggers are new event subscriptions, not new code paths. See Deliverable **15.6**.

---

## 8. Execution Engine

Manages running/finished executions: **Execution Queue · History · Timeline · Logs · Metrics · Replay · Comparison · Export · Recovery · Cloning.**

- **Queue** — tenant-partitioned, priority-ordered, concurrency-capped per tenant/plan.
- **History + Timeline** — every run is queryable with its live/finished timeline (powers Part 3 §19.1 Live Timeline).
- **Replay** — re-run a past execution with the same inputs (deterministic where possible) for debugging.
- **Comparison** — diff two runs (cost, outputs, timings, provider) for optimization.
- **Export** — export a run's logs/artifacts/metrics (compliance + analysis).
- **Recovery** — resume/restart from checkpoint or DLQ.
- **Cloning** — copy a run's config as the basis for a new one.

See Deliverable **15.7**.

---

## 9. Failure Recovery

Layered recovery so failures are routine, not catastrophic (ADR-030).

| Mechanism | Behavior |
|---|---|
| **Retry** | idempotent re-attempt with exponential backoff + jitter; capped attempts; never double-charges (idempotency key). |
| **Rollback** | undo partial side effects (delete half-written artifacts, void a pending publish). |
| **Checkpoint Recovery** | resume from the last successful stage; completed jobs are skipped. |
| **Resume** | continue a Paused/interrupted run. |
| **Dead Letter Queue** | poison/exhausted jobs park in the DLQ with full context for inspection. |
| **Escalation** | repeated/critical failures escalate to owner + (optionally) platform support. |
| **Notification** | failures notify per the notification service (Part 3 §11). |
| **Automatic Provider Switching** | on provider-caused failure (down/quota/timeout), fall back to the next configured provider **within cost policy** (ADR-005 Gateway) — never silently exceeding budget. |
| **Manual Intervention** | route to Manual Review for a human decision. |
| **Root-Cause Analysis** | each failure records a categorized cause + evidence (logs, provider response). |
| **Failure Categories** | transient · provider · quota/budget · validation · timeout · dependency · fatal/code · security. |

**Rule:** provider auto-switching and retries **must respect the per-video cost cap** (Part 1) and the workspace/monthly budget (§10); recovery never becomes a cost-runaway. See Deliverable **15.8**.

---

## 10. Cost Optimization Strategy

Automation **never spends unnecessarily** (Part 1 hard cap $1.55/video; extends Part 3 cost-optimization architecture). All model calls flow through the AI Gateway (ADR-005) for accounting and control.

**Levers:**
- **Provider Selection Rules** — cheapest provider that meets the quality tier (Scene Decision Engine HIGH/MED/LOW).
- **Free-Tier Preference** — prefer free/cheap tiers where quality allows.
- **Fallback Providers** — ordered fallbacks with per-fallback cost ceilings.
- **Model Selection** — DB-driven routing (no hardcoded models; closes ISS-E2).
- **Caching** — prompt_cache (sha256) + result cache; never pay twice for identical work.
- **Reuse of Assets** — Asset Library reuse (characters, scenes, music).
- **Duplicate Detection** — detect identical/near-identical requests and short-circuit.
- **Parallel Cost Limits** — cap concurrent paid tasks so fan-out can't blow the budget.
- **Budget Limits** — per-video, **workspace**, and **monthly** ceilings enforced server-side (ADR-004).
- **Cost Prediction** — pre-run estimate (Part 3 §19.6 / ADR-020) gates expensive runs.
- **Cost Alerts** — threshold alerts (Part 3/4 notifications).
- **Optimization Recommendations** — the engine proposes cheaper routings (Business Insights, Part 3 §19.10).

**Enforcement order at run time:** estimate → check budgets/entitlements → prefer cache/reuse → route to cheapest sufficient provider → cap parallelism → meter actuals → reconcile estimate-vs-actual (ADR-020). A run that would exceed a hard cap is **blocked or downgraded**, never silently overspent. See Deliverable **15.9**.

---

## 11. Observability

Every automation exposes, in real time: **Timeline · Current Stage · Progress · Worker · Provider · Model · Duration · Cost · Logs · Warnings · Errors · Retries · Outputs · Artifacts · Health.** Backed by structured per-job/per-stage records (correlation/run/tenant IDs on every log line). This is the data source for Part 3's Live Timeline (§19.1), Cost Breakdown (§19.2), and Quality Score (§19.4), and for the platform's AI Observability (Part 2 §11.4). See Deliverable **15.11** (Observability Matrix).

---

## 12. Multi-Tenant Isolation Rules

Guarantees (hard invariants, enforced server-side):
- A workspace **can never** access another workspace's jobs, runs, logs, artifacts, or queues.
- Every job/run is **owned** by exactly one tenant+workspace; all queries are tenant-scoped (RLS + application checks).
- **Provider credentials are tenant-specific** (Vault; ADR-010) — a job only ever uses its own tenant's keys.
- **Logs and artifacts are isolated** per tenant (storage prefixes + RLS).
- **Queues are logically isolated & partitioned** per tenant; one tenant's backlog can't starve another (fair scheduling + per-tenant concurrency caps).
- **Platform operators** access tenant automations only via audited impersonation (Part 2 ADR-002).

See Deliverable **15.12**.

---

## 13. AI Provider Abstraction

The engine **never depends on a specific provider**. Every capability is an adapter behind a stable interface (ADR-003), resolved from the registry/routing config: **LLM · Image · Animation · Voice · Music · Rendering · Publishing · Future providers.** A workflow references *capabilities*, not brands (e.g. "voice", not "ElevenLabs"); swapping a provider is a config/registry change with **no workflow redesign**. All calls route through the AI Gateway (ADR-005) for cost/fallback/observability. This makes §9's auto-switching and §10's provider rules possible.

---

## 14. Scalability & reliability posture (auto-improvements)

Added while reviewing for scale/reliability:
- **Stateless workers + persistent state** → horizontal scale; crash-safe.
- **Tenant-fair queue partitioning + per-plan concurrency caps** → no noisy-neighbor.
- **Idempotency keys everywhere** → safe retries, exactly-once side effects.
- **Backpressure** → when queues saturate, admit by priority; defer batch work.
- **Circuit breakers per provider** → stop hammering a down provider; fail fast to fallback.
- **Deadlines + timeouts on every job** → no stuck runs.
- **Checkpoint after every stage** → cheap resume; minimal rework on failure.
- **Poison-message handling (DLQ)** → one bad job never blocks a queue.
- **Partitioned/retained execution history** (ADR-007) → dashboards scale to millions of runs.

---

## 15. Required Deliverables

### 15.1 Automation Engine Architecture
Layers (top→bottom): **Definitions** (workflows/jobs/schedules/triggers, versioned config) → **Control plane** (validator, scheduler, trigger router, cost governor, entitlement gate) → **Execution plane** (tenant-partitioned queues → stateless workers → provider adapters via AI Gateway) → **State plane** (run/job state, checkpoints, artifacts, logs — all tenant-scoped) → **Observability plane** (timelines, metrics, audit). Every plane is multi-tenant and provider-agnostic.

### 15.2 Automation Lifecycle Diagram
The §3 state machine incl. auto-added Scheduled/Timed-Out/Skipped/Superseded.

### 15.3 Workflow Engine Architecture
DAG executor: nodes = stages(jobs), edges = control flow (seq/parallel/conditional/branch/merge/nested); versioned immutable definitions; per-stage mode + retry/timeout/cost policy; the content pipeline (Part 3 §7) is the built-in template workflow.

### 15.4 Job Engine Architecture
Uniform job contract (§5 table); jobs fan out into tasks; stateless execution + persisted state/checkpoints; priority + dependencies + idempotency.

### 15.5 Scheduler Architecture
Cron/interval/one-time + timezone + business-hours/retry-windows + validation/simulation + misfire policy; emits Time triggers.

### 15.6 Trigger Architecture
Event-driven trigger router over the platform bus (§7 table); each trigger = an event subscription that starts an execution.

### 15.7 Execution Engine Architecture
Queue → History/Timeline → Logs/Metrics → Replay/Comparison/Export → Recovery/Cloning (§8); tenant-partitioned, priority-ordered, concurrency-capped.

### 15.8 Failure Recovery Matrix
See §9 (mechanism · behavior) + failure categories; provider-switch & retries bounded by cost policy.

### 15.9 Cost Optimization Strategy
See §10 (levers + enforcement order); hard-cap gate blocks/downgrades over-budget runs.

### 15.10 Manual vs Automatic Execution Diagram
```
per-stage policy (Part 3 ADR-013):
 stage ─? MANUAL: pause → Manual Review → [approve|reject|edit|regenerate|continue] ─► next
        └? AUTO:   run → live progress ─┬─ ok ─► next
                                        ├─ emergency pause ─► Paused
                                        ├─ manual takeover ─► convert to MANUAL
                                        └─ resume ─► continue
Global: Emergency Stop · "require approval before any PAID stage" (default ON, Part 1)
```

### 15.11 Observability Matrix
| Signal | Source | Consumer |
|---|---|---|
| Timeline / Current Stage / Progress | run+stage state | Live Timeline (P3 §19.1) |
| Worker / Provider / Model | execution record | debugging, AI Observability (P2 §11.4) |
| Duration / Retries | job metrics | reliability dashboards |
| Cost (running + final) | AI Gateway accounting | Cost Breakdown (P3 §19.2), budgets |
| Logs / Warnings / Errors | structured job logs | debugging, RCA (§9) |
| Outputs / Artifacts | artifact store (tenant-scoped) | review, publishing |
| Health | health-check jobs | Workspace/API Health (P3 §5) |

### 15.12 Multi-Tenant Isolation Rules
See §12 (hard invariants).

### 15.13 Missing Feature Report → §16.1
### 15.14 Architecture Improvement Suggestions → §16.2
### 15.15 ADR Updates → §16.3
### 15.16 Migration Backlog Updates → §16.4

---

## 16. Governance

### 16.1 Missing Feature Report (found while designing Part 5)
1. **Generic Workflow/DAG engine** — the prototype has a linear pipeline concept, not a configurable multi-control-flow engine (ISS-P5-01).
2. **Universal Job Engine** — no uniform job primitive (lifecycle/priority/deps/timeout/retry/idempotency/checkpoint) across all actions (ISS-P5-02).
3. **Queue + stateless workers + DLQ** — no real queue/worker/dead-letter infrastructure (extends ISS-P2-05, ISS-A2/M4) (ISS-P5-03).
4. **Enterprise Scheduler** — current `schedules` is config-only, no execution/validation/simulation/misfire (extends ISS-A3/M5) (ISS-P5-04).
5. **Event-driven Trigger router** — no trigger engine over an event bus (needs ADR-007 bus) (ISS-P5-05).
6. **Execution management** — no history/timeline/replay/comparison/export/clone (ISS-P5-06).
7. **Layered Failure Recovery** — no checkpoint/rollback/DLQ/escalation/RCA/categorized failures (ISS-P5-07).
8. **Cost governor at engine level** — budget caps (workspace/monthly), parallel cost limits, duplicate detection, provider-switch-within-budget (extends Part 3 cost arch) (ISS-P5-08).
9. **Provider auto-switching / circuit breakers** — no automatic, cost-bounded provider fallback (ISS-P5-09).
10. **Tenant-fair queue partitioning + concurrency caps** — no noisy-neighbor protection (ISS-P5-10).
11. **Idempotency + exactly-once side effects** — not guaranteed on retries/publishing (ISS-P5-11).
12. **Engine-level observability** (correlation IDs, per-job metrics feeding P3/P2 surfaces) (ISS-P5-12).

**Already tracked (referenced):** pipeline↔engine wiring (ISS-A2/M4), scheduler runner (ISS-A3/M5), Queue/Job Manager console (ISS-P2-05), AI Gateway console (ISS-P2-06), DB-driven routing (ISS-E2), per-tenant Vault (ISS-B2/M3), event bus/webhooks (ISS-P2-12), Live Timeline/Cost/Quality (ISS-P3-R1-01/02/04), workflow-driven reframe (ISS-P3-R1-11).

### 16.2 Architecture Improvement Suggestions
1. **Adopt a durable workflow-orchestration model** (persisted state + checkpoints + idempotency) rather than ad-hoc pipeline code — this is the single biggest reliability lever.
2. **One Job primitive to rule them all** — every action (incl. onboarding steps, backups, health checks) is a job → uniform observability, retry, audit for free (ADR-017 realized).
3. **Tenant-fair scheduling from day one** — partition queues + per-plan concurrency caps before scale, not after an incident.
4. **Cost governor as a mandatory gate in the control plane** — no job executes a paid provider without passing estimate + budget checks; auto-switching bounded by the same gate.
5. **Circuit breakers + ordered fallbacks per provider** — resilience to provider outages without runaway cost.
6. **Partition + retain execution history** — treat runs as high-volume telemetry (ADR-007) so observability scales.
7. **Everything config-driven** — workflows, routing, schedules, retry/timeout policies live in config/registries, enabling marketplace workflows and provider swaps without redesign.

### 16.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-030** — Durable, checkpointed, idempotent execution: runs persist state + checkpoints; retries are exactly-once via idempotency keys; recovery resumes from the last checkpoint.
- **ADR-031** — Tenant-fair queues: queues are partitioned per tenant with per-plan concurrency caps + backpressure; no cross-tenant starvation.
- **ADR-032** — Engine-level cost governor: a mandatory control-plane gate estimates + enforces per-video/workspace/monthly budgets before any paid job; retries/provider-switching are bounded by it.
- **ADR-033** — Cost-bounded provider auto-switching with circuit breakers: provider failures fall back to the next configured adapter within budget; a tripped breaker fails fast to fallback.
- **ADR-034** — Event-driven triggers & durable scheduler: all triggers are event-bus subscriptions; the scheduler validates/simulates and applies an explicit misfire policy.

### 16.4 Migration Backlog updates
Items **ISS-P5-01 … ISS-P5-12** added. New epic **M11 (Automation Engine — durable workflow/job runtime)**, absorbing/extending M4 (pipeline wiring) and M5 (scheduler execution); cross-links M8 (Queue/Gateway consoles), M3 (per-tenant creds), M1 (isolation). See `MIGRATION-BACKLOG.md`.

---

---

## 17. Revision 1 — Enterprise Engine Enhancements

Revision 1 **adds** the following without removing anything above. Overlaps **improve** existing surfaces (mappings noted); nothing is duplicated. Two cross-cutting principles emerge: **workflows are versioned, installable assets** (Builder + Marketplace + Version Control), and **the engine explains and heals itself** (Decision Engine + Self-Healing + Health).

### 17.1 Visual Workflow Builder (future-ready)
*Improves the Workflow Engine (§4) — the engine must already model workflows as editable node graphs even though V1 ships predefined workflows.*

A future **node-based Workflow Builder** supporting: **Drag & Drop · Zoom · Pan · Node-Based Workflows · Workflow Templates · Nested Workflows · Workflow Versioning · Workflow Diff · Import · Export · Clone · Read-Only Mode · Simulation Mode.** **Architecture rule:** workflow definitions are already stored as **serializable, versioned DAGs** (§4), so a visual editor is a *view/controller over the same definition* — no engine redesign is needed to add it later (ADR-035). V1 may expose only curated templates; the schema and APIs must not preclude the editor.

### 17.2 Automation Marketplace (future-proof)
*Extends Workflow Engine (§4, "future marketplace workflows") + copy-on-use (ADR-006) + entitlements (ADR-004).*

Treat **workflows as reusable, installable assets**: **Official · Community · Premium Templates · Import · Export · Version Compatibility · Ratings · Updates · One-Click Installation.** Installation is **copy-on-use** into the tenant's workflow library (isolated deep-copy, ADR-028), gated by entitlements, with **version-compatibility checks** against the engine version. Premium/community distribution reuses the platform marketplace direction (Part 2 §11) and billing (M9). No engine redesign — a marketplace template is just a versioned workflow definition with metadata.

### 17.3 Execution Visualizer (the debugging center)
*Improves Observability (§11) and the Live Timeline (Part 3 §19.1) — a live DAG view of a run.*

Every run exposes a **live DAG visualization**: **Live DAG · Active Node · Waiting Nodes · Completed Nodes · Failed Nodes · Retry Nodes · Execution Path · Duration · Cost · Logs · Worker · Provider · Model · Produced Artifacts.** This is the **debugging center** — the graph form of the §8 Execution Engine + §11 signals. Node click → the job's inputs/outputs/logs/cost (§5). Reuses the same run/stage state; no new data model, just a richer projection.

### 17.4 Automation Version Control
*Improves Workflow Engine versioning (§4) — formalizes an immutable, git-like version model.*

**No workflow is ever overwritten** (ADR-036). Supported states + operations: **Version History · Compare Versions · Rollback · Restore · Publish Version · Draft Version · Active Version · Archived Version.** A workflow has at most one **Active** version; edits create a **Draft**; publishing promotes a Draft to Active and demotes the prior Active to history; **in-flight executions pin their version** (§4), so publishing never mutates running work. Diff/compare powers the Builder (§17.1) and Marketplace updates (§17.2).

### 17.5 Smart Queue Management
*Improves the Execution Engine queues (§8) and tenant-fair partitioning (§12, ADR-031).*

**Queue Priorities · Fair Scheduling · Saturation Detection · Auto-Scaling-Ready · Queue Metrics · Queue Visualization · Queue Replay · Queue Draining · Queue Partitioning · Queue Health.** Saturation detection drives **backpressure + autoscale signals** (workers scale on depth/latency); **draining** lets a queue quiesce for maintenance without losing work; **replay** re-enqueues from history/DLQ. All per-tenant-partitioned (ADR-031); metrics/health feed the Automation Health Center (§17.11).

### 17.6 Worker Management Center
*New operational surface over the stateless-worker model (§5, §14). Platform-side (Super Admin, Part 2 §2.3).*

Displays: **Active Workers · Idle Workers · Failed Workers · Restart Count · Worker Health · Worker Capacity · Current Jobs · Historical Jobs · Worker Logs · Worker Performance.** **Future-ready for distributed workers** — workers are stateless and horizontally scalable (§14), so the center manages an elastic pool. Feeds autoscale (§17.5) and Health (§17.11). (Workers are platform infrastructure; tenants never see other tenants' workers — isolation §12.)

### 17.7 Cost Governor Dashboard
*Surfaces the internal Cost Governor (§10, ADR-032) — internal enforcement stays; this adds visibility. Client-scoped mirror of Part 3 §19.2/§19.6; platform-scoped for Super Admin.*

Dashboard: **Budget · Current Spend · Estimated Spend · Cost by Provider · Cost by Workflow · Cost by Job · Cost Trends · Savings · Budget Alerts · AI Recommendations.** The governor (§10) remains the *enforcement* layer; this dashboard is its *observability* layer. Client view is tenant-scoped (workspace budgets); Super-Admin view aggregates across tenants (platform margin, Part 2). Recommendations reuse Business Insights / AI Recommendation Engine (Part 3 §19.10, Part 2 §11.10).

### 17.8 AI Decision Engine (explainable automation)
*Documents and unifies the decision logic already implied by §9 (recovery), §10 (cost), §13 (providers) — every automated choice is explainable + auditable (ADR-037).*

The engine intelligently decides: **which provider · which model · whether to retry · whether to downgrade · whether to pause · whether manual approval is required · whether to switch providers · whether to cancel.** **Every decision records:** the inputs/signals considered, the policy applied (§17.9), the chosen action, the alternatives rejected, and the cost/quality rationale — written to the audit trail and shown in the Execution Visualizer (§17.3). No black-box automation: decisions are **explainable and auditable** by construction. Decisions never bypass the cost governor (§10) or the paid-run approval rule (Part 1).

### 17.9 Execution Policies
*New configurable policy layer influencing §9/§10/§13 behavior (ADR-038).*

Configurable per workspace/workflow: **Cost First · Speed First · Quality First · Balanced · Enterprise Custom.** A policy is a **named weighting** over (cost, latency, quality, reliability) that steers provider/model selection, retry aggressiveness, downgrade thresholds, and parallelism. The AI Decision Engine (§17.8) reads the active policy as its objective function; policies are config (no hardcoding) and honored within the hard cost cap (Part 1) — e.g. "Quality First" still cannot exceed the per-video budget, it optimizes quality *under* the cap.

### 17.10 Sandbox Automation (strengthened)
*Improves Sandbox (Part 3 §19.3, ADR-019) with engine-level guarantees.*

**Test Data · Mock Providers · Simulated Publishing · Partial Execution · Safe Rollback · Cost-Free Validation · Result Comparison.** Engine-level: sandbox runs use **mock provider adapters** (deterministic, $0) and a **stubbed Publishing job** (ADR-019); they execute against **test data** in an isolated namespace so **production data is never affected**; **result comparison** diffs sandbox vs a reference/production run (reuses §8 Comparison). Strengthens ADR-019 with mock-adapter + isolated-namespace guarantees.

### 17.11 Platform-Wide Automation Health Center
*New platform surface aggregating engine telemetry (§11) — complements per-workspace Workspace Health (Part 3 §5) and platform Health Center (Part 2 §11.5).*

Displays: **Engine Health · Queue Health · Worker Health · Provider Health · Workflow Health · Job Success Rate · Failure Rate · Recovery Rate · Average Runtime · Average Cost.** Aggregated from run/job telemetry (§11), rollup-backed (ADR-007) for scale. Super-Admin-facing (fleet view); a tenant-scoped subset feeds each workspace's health widgets.

### 17.12 Self-Healing Automation (future architecture)
*Extends Failure Recovery (§9) toward autonomous recovery (ADR-039).*

Documented future capabilities: **Automatic Retry · Intelligent Retry Delay · Alternate Provider Selection · Resource Recovery · Deadlock Detection · Stuck-Job Recovery · Queue Recovery · Automatic Escalation.** **Principle:** the system attempts to recover **autonomously before requesting human intervention** — retry with adaptive backoff, switch providers within budget (ADR-033), reclaim leaked resources, detect deadlocks/stuck jobs via deadlines (§14), drain/replay a broken queue (§17.5), and **escalate to a human only when self-healing is exhausted.** All self-healing actions are decisions (§17.8): explainable, auditable, and cost-bounded (§10).

### 17.13 Deliverable reconciliations (Revision 1)

**Automation Lifecycle** (extends §3): add **Draft/Active/Archived workflow-version** as a dimension orthogonal to run states (a run pins a workflow version, §17.4); add **Self-Healing** as an automatic loop preceding Manual Review in the failure path (§17.12).

**Workflow Engine** (extends §4): definitions are **serializable versioned DAGs** editable by a future Visual Builder (§17.1), installable from a Marketplace (§17.2), and governed by Version Control (§17.4).

**Job / Execution Engines** (extends §5, §8): runs are projected as a **live DAG** in the Execution Visualizer (§17.3); execution history powers replay/comparison for sandbox (§17.10) and queue replay (§17.5).

**Scheduler / Trigger Engines** (extends §6, §7): unchanged in mechanism; Execution Policies (§17.9) may vary retry-window aggressiveness per policy.

**Failure Recovery** (extends §9): gains the **Self-Healing loop** (§17.12) and **explainable decisions** (§17.8) — recovery order becomes: self-heal (retry/backoff/provider-switch/resource-recovery) → escalate → Manual Review → DLQ.

**Cost Optimization** (extends §10): gains the **Cost Governor Dashboard** (§17.7, observability) and **Execution Policies** (§17.9, objective function); enforcement gate unchanged (ADR-032).

**Observability** (extends §11): gains the **Execution Visualizer** (§17.3), **Worker Management Center** (§17.6), and **Platform-Wide Automation Health** (§17.11).

### 17.14 Missing-feature report (Revision 1)
All 12 items are net-new engine capabilities vs the prototype, tracked as **ISS-P5-R1-01…12** (§16.4 update). No existing Part-5 functionality removed.

### 17.15 ADR updates (Revision 1)
- **ADR-035** — Workflows are **serializable, versioned DAGs**; UI (incl. a future Visual Builder) is a view/controller over the definition — no engine redesign to add editing.
- **ADR-036** — **Immutable workflow version control**: no overwrite; Draft→Active→Archived; one Active version; in-flight runs pin their version.
- **ADR-037** — **Explainable, auditable AI Decision Engine**: every automated decision records signals, policy, chosen action, rejected alternatives, and cost/quality rationale.
- **ADR-038** — **Configurable Execution Policies** (Cost/Speed/Quality/Balanced/Enterprise) are the Decision Engine's objective function, always honored within the hard cost cap.
- **ADR-039** — **Self-healing before human intervention**: bounded autonomous recovery (retry/backoff/provider-switch/resource+queue+stuck-job recovery); escalate only when exhausted.

---

**End of Part 5 — Revision 1 · Status: APPROVED & LOCKED · Version: Revision 1.** Future changes only via an explicit **Revision 2** upgrade. Permanent Source of Truth for the Automation Engine; conflicts resolve to Part 1 → Part 2 → Part 3 → Part 4. Awaiting the next Bible part.
