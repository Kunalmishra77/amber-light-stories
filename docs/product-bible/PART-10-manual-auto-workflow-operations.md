# Part 10 — Complete Manual vs Automatic Workflow, Human Review & Enterprise Operations Architecture

**Status: Draft (Awaiting Review)**
**Version: 1.0**
**Date: 2026-07-20**

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Parts 3–9 (all Rev 1 Locked). This document is the permanent Source of Truth for the **operational experience** (manual/auto modes, human review, operations, collaboration) once approved.

**Relationship to prior parts (no duplication):** Part 3 §8 introduced per-stage manual/auto policy (ADR-013); Part 5 defined the Automation Engine (jobs/lifecycle/recovery/observability) and §15.10 the manual/auto execution diagram; Part 6 §11 defined pipeline Human Review; Part 3 §11 / Part 9 §4 defined notifications/events. **Part 10 is the *human-interaction layer* over that unchanged engine** — how people drive, review, edit, collaborate on, and operate the automations. **The Automation Engine (Part 5) does not change**; this document specifies the *control surface*. It references (not restates) the engine, the pipeline stages, and the event/notification backbone.

**Core principle:** mode is a **per-stage policy on the run**, not a property of the engine — so switching Manual ↔ Semi-Auto ↔ Fully-Auto **at any time** changes only the approval matrix the engine reads (Part 3 ADR-013), never the engine itself (ADR-080).

---

## 0. Reading guide
Sections 1–10 are the operational design. Section 11 holds the **14 required deliverables**. Section 12 is governance (missing-feature report, improvements, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. Workflow Modes

Three modes, all expressed as the **same per-stage approval policy** on a run (ADR-080). A run/workspace can switch modes anytime; in-flight stages honor the mode active when they reach the gate.

### 1.1 Manual Mode
**Every stage pauses** for human review before continuing. Per stage the reviewer can: **Edit · Approve · Reject · Regenerate · Retry · Skip (where allowed).** Every action is **audited** (Part 7 §10). This is the maximum-control mode (and the default for a new/low-trust workspace and for any paid stage — Part 1 paid-run rule).

### 1.2 Semi-Automatic Mode
The client **chooses which stages require approval**; everything else continues automatically. The **approval policy is configurable** (the per-stage matrix, §2) — e.g., "pause at Script and Publishing, auto everything else." This is the default steady-state for a trusting workspace: humans gate only what matters.

### 1.3 Fully Automatic Mode
The **entire workflow runs automatically**; only important notifications surface. Failures **follow recovery policies automatically** (Part 5 §9 + self-healing §17.12) before escalating to a human. Even here, the workspace-wide **"require approval before any paid stage"** safety toggle (default ON, Part 1) and Emergency Stop remain available.

**Mode is orthogonal to the engine:** all three are the engine running the same jobs with a different approval matrix; **no engine change** to switch (ADR-080). See Deliverable **11.1**.

---

## 2. Stage Approval System

Every AI Pipeline stage (Part 6) supports **configurable approval**. Stages (illustrative): Idea · Research · Outline · Script · Prompt · Storyboard · Image · Animation · Voice · Music · Assembly · Thumbnail · SEO · Publishing · Analytics.

**Approval types per stage (config, ADR-081):**
| Type | Behavior |
|---|---|
| **Required Approval** | always pause for a human (e.g., Publishing, factual Script) |
| **Optional Approval** | proceed automatically but allow a human to intervene/review |
| **Auto Approval** | proceed on success + quality-pass, no human |
| **Conditional Approval** | pause **only if** a condition holds — e.g., quality score < threshold (Part 6 §5), cost > budget (Part 5 §10), compliance flag (Part 6 §16.7), first-ever run, new character/style |

**Rules:** the approval matrix lives in the versioned Workspace Profile (ADR-012); paid stages default to Required until the owner opts into auto (Part 1); Conditional Approval is the intelligent default — humans are pulled in **only when signals warrant it**. The engine reads this matrix at each gate; the modes (§1) are presets over it. See Deliverable **11.5**.

---

## 3. Human Review Center

The unified surface where humans act on paused stages (realizes Part 6 §11 as a first-class module; reuses the Part 5 Execution Visualizer §17.3).

**Supports:** **Queue · Priority · Filters · Comments · Version Comparison · AI Suggestions · History · Assignment · Bulk Approval.**

**Architecture:**
- **Review Queue** — all items awaiting human action across runs, **prioritized** (deadline, cost-at-risk, plan tier) and **filterable** (stage, workspace, status, assignee).
- **Assignment** — items assigned to reviewers/approvers (roles, Part 3 §15.7 / Part 7); an item can route to a specific person or a role pool.
- **Review context** — each item shows inputs/outputs/artifacts, **AI Suggestions** (propose-only, Part 6 §9 / ADR-014), quality + cost, and **version comparison** (§7).
- **Comments + History** — threaded comments; full action history (audited).
- **Bulk Approval** — approve/reject many items at once (with guardrails — bulk-approving paid stages still respects the safety toggle).
- Powers the "Pending Approvals" dashboard widget (Part 3 §5). See Deliverable **11.6**.

---

## 4. Operations Center

The operational control tower over the engine's runs/jobs (the human-facing view of Part 5's Execution Engine §8 + Smart Queue §17.5 + Worker Center §17.6; tenant-scoped for the client, fleet-scoped for Super Admin).

**Displays (all observable):** **Running Jobs · Queued Jobs · Failed Jobs · Paused Jobs · Retrying Jobs · Scheduled Jobs · Manual Jobs · Automatic Jobs.**

**Architecture:**
- Live, filterable view of every run/job with its state (Part 5 §3), stage, provider/model, cost, duration, timeline (Part 3 §19.1 Live Timeline).
- **Operational actions** per job/run (§8): pause/resume/retry/rollback/restart/cancel/clone/duplicate/schedule + **Emergency Stop / Mass Pause / Mass Resume**.
- Backed by engine observability (Part 5 §11, Part 9 §10) — nothing here is a new engine capability, it is the **human control surface** over existing job operations. See Deliverable **11.7**.

---

## 5. Notification Center

The operational face of the event-driven notification service (Part 3 §11, Part 9 §4; extends channels).

**Channels:** Email · In-App · Push · Webhook · Future SMS.
**Categories:** Approval Needed · Workflow Completed · Failure · Budget Warning · Provider Failure · Publishing Success · Publishing Failure · Subscription · Security · System.

**Architecture:** every notification is **configurable per user** (which categories via which channels, quiet-hours from Working Hours, Part 4 §5); driven by domain events (Part 9 §4) through the one notification service (ADR-016); **Approval-Needed** notifications deep-link into the Review Center (§3). Consolidates the notification matrices from Parts 3/4/5/7/8 under one center. See Deliverable **11.8**.

---

## 6. Review Experience

What a reviewer sees when acting on an item — designed for fast, confident decisions.

**Supports:** **Before/After Comparison · AI Explanation · Version History · Change History · Cost Difference · Quality Difference · Approval History · Review Notes.**

**Architecture:**
- **Before/After + Cost/Quality Difference** — when regenerating/editing, show the old vs new output side-by-side with the **cost delta** (Part 3 §19.2) and **quality-score delta** (Part 6 §5) so the reviewer sees the trade-off.
- **AI Explanation** — why the AI produced this (Decision Engine rationale, Part 5 ADR-037 / Part 6 §9) — explainable, not a black box.
- **Version + Change History** — full lineage of an artifact (immutable, §7); **Approval History** shows who decided what and when (audited).
- **Review Notes** — reviewer's rationale captured for the record. See Deliverable **11.6**.

---

## 7. Manual Editing (versioned, never overwrites)

Humans can edit: **Scripts · Prompts · Storyboard · Images · Captions · Metadata · SEO · Thumbnail · Publishing Schedule · Brand Assets.**

**Hard rule (ADR-082):** **no edit overwrites history — everything is versioned.** An edit creates a **new version** of the artifact (immutable prior versions, like workflow/prompt versioning ADR-036/041); the run pins the version in use; rollback restores a prior version. Edits are audited and attributed. This makes every human change reversible and traceable, and lets Content Memory (Part 6 §10) learn from human corrections. See Deliverable **11.2**.

---

## 8. Operational Policies

Configurable policies governing run/job control (the human-facing operational verbs over Part 5's mechanics):

**Verbs:** Pause · Resume · Retry · Rollback · Restart · Cancel · Clone · Duplicate · Schedule · Emergency Stop · Mass Pause · Mass Resume.

**Architecture:**
- Each verb maps to an engine operation (Part 5 §8-9) with **permission gating** (who may do it, Part 3 §15.7 / Part 7) and **audit**.
- **Emergency Stop** halts all automation in a workspace instantly (Part 5 §8); **Mass Pause/Resume** operate on a filtered set (e.g., "pause all runs on provider X").
- **Rollback/Restart** use checkpoints (Part 5 ADR-030); **Clone/Duplicate** copy a run's config as a new run.
- Policies are **config-driven** (which roles may invoke which verb, whether mass-ops need confirmation/approval). See Deliverable **11.7**.

---

## 9. Human Collaboration

Team collaboration around runs/reviews (builds on Part 7 teams + Part 3 §15.7 roles).

**Supports:** **Comments · Mentions · Assignments · Reviewers · Approvers · Observers · Internal Notes · Activity Timeline.**

**Architecture:**
- **Roles in review** — Reviewers (can approve/reject), Approvers (final gate / approval chains, Part 4 ADR-026), Observers (read-only), mapped to Part 3/7 roles.
- **Comments + Mentions** — threaded discussion on any run/stage/artifact; @mention notifies (Notification Center §5).
- **Assignments** — route work to people/roles (§3).
- **Internal Notes** — team-only annotations not part of the content.
- **Activity Timeline** — a per-workspace/per-run chronological feed of all human + system actions (audited, Part 7 §10). See Deliverable **11.9**.

---

## 10. Operational Analytics

Metrics on how the human+automation system performs (complements Part 6 §16.12 Pipeline Analytics, Part 5 §17.11 Automation Health).

**Displays:** **Approval Rate · Review Time · Automation Percentage · Manual Percentage · Failure Rate · Recovery Rate · Retry Rate · AI Acceptance Rate · Human Edit Rate · Publishing Success.**

**Architecture:** rollup-backed (ADR-007/074) from review + job + event streams; reveals **how automated a workspace really is** (automation vs manual %), **how good the AI is** (AI acceptance vs human-edit rate), and **operational health** (failure/recovery/retry, review-time bottlenecks). Feeds Business Insights (Part 3 §19.10) — e.g., "your AI acceptance rate is 92%, consider moving Script to auto." See Deliverable **11.10**.

---

## 11. Required Deliverables

### 11.1 Workflow Mode Architecture
Mode = per-stage approval policy on the run (ADR-080); Manual/Semi-Auto/Fully-Auto are presets over the matrix; switch anytime without engine change; paid-stage safety toggle + Emergency Stop always available.

### 11.2 Manual Workflow
Every stage pauses → Edit/Approve/Reject/Regenerate/Retry/Skip; all audited; all edits versioned (ADR-082); default for new/low-trust workspaces + paid stages.

### 11.3 Semi-Automatic Workflow
Configurable per-stage approval matrix (§2); pause only chosen stages; steady-state default; Conditional Approval pulls humans in on quality/cost/compliance signals.

### 11.4 Fully Automatic Workflow
End-to-end auto; auto-recovery/self-healing before human (Part 5 §9/§17.12); only important notifications; paid-stage safety toggle + Emergency Stop retained.

### 11.5 Approval Architecture
Per-stage Required/Optional/Auto/Conditional (§2, ADR-081); matrix in versioned Workspace Profile; engine reads matrix at each gate; conditional triggers = quality<threshold, cost>budget, compliance flag, first-run, new asset.

### 11.6 Human Review Architecture
Review Center (queue/priority/filters/assignment/bulk) + Review Experience (before-after/AI-explanation/version+change-history/cost+quality-diff/approval-history/notes); propose-only AI suggestions.

### 11.7 Operations Center
Live view of running/queued/failed/paused/retrying/scheduled/manual/automatic jobs + operational verbs (§8) incl. Emergency Stop / Mass Pause/Resume; human control surface over Part 5 engine.

### 11.8 Notification Architecture
Email/In-App/Push/Webhook/future-SMS × 10 categories; per-user configurable; event-driven (one service, ADR-016); Approval-Needed deep-links to Review Center.

### 11.9 Collaboration Architecture
Comments/mentions/assignments; Reviewers/Approvers/Observers roles + approval chains; internal notes; per-run/workspace activity timeline; all audited.

### 11.10 Operational Analytics
Approval-rate/review-time/automation-%/manual-%/failure/recovery/retry/AI-acceptance/human-edit/publishing-success; rollup-backed; feeds Business Insights.

### 11.11 Missing Feature Report → §12.1
### 11.12 Improvement Suggestions → §12.2
### 11.13 ADR Updates → §12.3
### 11.14 Migration Backlog Updates → §12.4

---

## 12. Governance

### 12.1 Missing Feature Report (found while designing Part 10)
1. **Three-mode workflow presets** (Manual/Semi-Auto/Fully-Auto) as switchable presets over the per-stage matrix — prototype has only a coarse auto-approve (extends ISS-P3-03) (ISS-P10-01).
2. **Conditional Approval** (pause on quality/cost/compliance/first-run/new-asset signals) — not present (ISS-P10-02).
3. **Human Review Center** (queue/priority/filters/assignment/bulk/AI-suggestions) as a first-class module (ISS-P10-03).
4. **Review Experience** (before/after, cost+quality diff, AI explanation, version/change history) (ISS-P10-04).
5. **Operations Center** (live jobs view + operational verbs + Emergency Stop/Mass Pause/Resume) — human control surface (ISS-P10-05).
6. **Versioned manual editing** (no overwrite; every edit a new version; rollback) across scripts/prompts/images/metadata/etc. (extends ADR-036/041) (ISS-P10-06).
7. **Unified Notification Center** (all channels incl. push/SMS, all categories, per-user config, deep-links) (ISS-P10-07).
8. **Collaboration** (comments/mentions/assignments/reviewers/approvers/observers/internal-notes/activity-timeline) (ISS-P10-08).
9. **Operational Analytics** (automation-% , AI-acceptance, human-edit-rate, review-time, approval-rate) (ISS-P10-09).
10. **Approval chains for teams/enterprise** (multi-approver gates) — extends Part 4 ADR-026 (ISS-P10-10).

**Already tracked (referenced):** per-stage manual/auto matrix (ISS-P3-03/ADR-013), engine ops/queue/worker (M11, ISS-P5-R1-03/05/06), pipeline Human Review (Part 6 §11), Live Timeline/Execution Visualizer (ISS-P3-R1-01/P5-R1-03), notifications service (ADR-016), event bus (ISS-P9-02), versioned assets (ADR-036/041/049), RBAC + teams (Part 7 M13), Business Insights (ISS-P3-R1-10).

### 12.2 Improvement Suggestions
1. **Mode as a preset over one matrix** — don't build three workflows; build one per-stage approval matrix and expose Manual/Semi/Auto as presets → switching is instant and engine-free (ADR-080).
2. **Conditional Approval as the smart default** — pull humans in only on real signals (low quality, over budget, compliance, novelty); maximizes automation without sacrificing safety.
3. **Every human action is versioned + audited** — edits never overwrite; the review trail is compliance + learning gold (Content Memory learns from human edits).
4. **One Review Center, one Operations Center, one Notification Center** — consolidate the scattered surfaces so operators have a single place to review, operate, and get alerted.
5. **Show the trade-off at the point of decision** — cost delta + quality delta + AI explanation on every review screen → faster, better human decisions.
6. **Operational analytics drive automation growth** — measuring AI-acceptance/human-edit rates tells a workspace *which stages are safe to automate next*, converting manual users into automatic ones over time.
7. **Approval chains scale to enterprise** — reuse the org/team model (Part 7) so multi-reviewer gates need no new primitive.

### 12.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-080** — **Workflow mode is a per-run preset over the per-stage approval matrix, not an engine mode**: Manual/Semi-Auto/Fully-Auto select an approval matrix the unchanged engine reads; switching modes anytime changes only the matrix (never the engine); paid-stage safety toggle + Emergency Stop always apply.
- **ADR-081** — **Four approval types per stage, with Conditional as the intelligent default**: each stage is Required/Optional/Auto/Conditional; Conditional pauses only on signals (quality<threshold, cost>budget, compliance flag, first-run, new asset); matrix lives in the versioned Workspace Profile.
- **ADR-082** — **Human edits never overwrite — everything versioned**: every manual edit (script/prompt/image/metadata/etc.) creates a new immutable version; the run pins the version; rollback restores; edits are audited, attributed, and feed Content Memory.

### 12.4 Migration Backlog updates
Items **ISS-P10-01 … ISS-P10-10** added under new epic **M15 (Operations & Human-in-the-Loop — modes, review, operations, collaboration)**, running on M11 (engine) + M14 (events/observability) + M13 (RBAC/audit); cross-links M10 (workspace UX). See `MIGRATION-BACKLOG.md`.

---

**End of Part 10 — Status: Draft (Awaiting Review) · Version 1.0.** Not locked. Permanent Source of Truth for the operational experience once approved; conflicts resolve to Part 1 → … → Part 9. Awaiting owner review → then the next Bible part.
