# Part 3 — Complete Client Experience & Workspace Architecture (Revision 1)

**Status: APPROVED & LOCKED**
**Version: Revision 1**
**Date: 2026-07-20**

**Version history:**
| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 (Draft) | 2026-07-20 | Awaiting Review | Initial Client Experience & Workspace architecture; 15 deliverables; ADR-011…016; M10. |
| **Revision 1** | 2026-07-20 | **APPROVED & LOCKED** | +11 enhancements (§19): Live Automation Timeline, Per-Video Cost Breakdown, Automation Sandbox, AI Quality Score, Workspace Readiness Score, Cost/Credit Estimator, Workspace Templates, Learning Center, Success Checklist, Business Insights Engine, and the **Workflow-Driven Architecture** reframe. Matrices/ADR/backlog/index reconciled. ADR-017…020 added; ISS-P3-R1-01…11 added. Future changes only via explicit **Revision 2**. |

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything. Part 2 (`product-bible/PART-2-platform-and-super-admin.md`, Rev 1 Locked) overrides implementation. This document is the permanent Source of Truth for the **complete Client Experience** once approved.

**Framing (per objective):** the platform does not sell software — it sells an **AI-powered YouTube Automation Business**. Every module below exists because it helps the client *grow their channel*. Where a section could be "just a page," it is instead defined as a step in the client's business journey.

> **Design invariants inherited from Parts 1–2** — every item in this document obeys these; they are not repeated per section:
> 1. **Tenant isolation always** — a workspace only ever sees its own data (RLS + entitlements).
> 2. **Config-driven, no hardcoding** — brand, providers, models, cadence, and rules come from the Workspace Profile / registries, never from code (ADR-003, ADR-012).
> 3. **Platform ≠ Workspace** — the client never sees platform brand, platform data, or Super Admin surfaces. Operators enter only via audited impersonation (ADR-001, ADR-002).
> 4. **AI through the Gateway** — all model calls go through the central AI Gateway for cost/observability/fallback (ADR-005).
> 5. **Server-side entitlement enforcement** — every gated action checks plan limits (ADR-004).

---

## 0. Reading guide

Sections 1–14 are the **narrative design** (the experience). Section 15 is the **15 required deliverables** in explicit, referenceable form (journey map, sitemaps, matrices, diagrams, reports). Sections 16–18 are **governance** (missing-feature report, improvement suggestions, backlog + ADR updates). If narrative and deliverable ever disagree, the deliverable table wins.

---

## 1. The Client Business Journey (complete, gap-filled)

The journey is modeled as a **lifecycle state machine**, not a set of pages. The workspace holds one of these states at all times; the UI adapts to the current state (ADR-011).

```
[ Provisioned ]  super admin creates client + sends credentials
      │
      ▼
[ First Login ]  forced password change (P6.2) → identity confirmed
      │
      ▼
[ Welcome & Tour ]  what/why/how, time-to-value, expected outcome
      │
      ▼
[ Setup Wizard ]  Workspace Profile authored (brand, niche, audience, cadence, mode…)
      │
      ▼
[ API Configuration ]  providers connected, validated, health-checked
      │
      ▼
[ Subscription Selection ]  plan chosen → entitlements provisionally attached
      │
      ▼
[ Submitted for Approval ]  workspace read-only; awaiting Super Admin
      │
      ▼
[ Super Admin Approval ]  (Part 2) approve / request-changes / reject
      │
      ▼
[ Workspace Activated ]  automation unlocked; entitlements enforced
      │
      ▼
[ Dashboard / Daily Operations ]  the steady state (planning → pipeline → publish)
      │
      ├─► Content Planning ─► AI Automation (pipeline) ─► Review ─► Publishing ─► Analytics
      │                                   ▲                                   │
      │                                   └────── Continuous Learning ◄───────┘
      ▼
[ Growth ]  performance insights → strategy adjustments → recommendations
      │
      ▼
[ Renewal / Expansion ]  plan renewal, upgrades, add-on credits, more channels
      │
      ▼
[ Team Collaboration ]  invite roles, delegate review/publish, audit
      │
      ▼
[ Long-Term Automation ]  hands-off cadence; exceptions surface to humans
      │
      ├─► [ Paused / Past-Due ]  (billing lapse) — automation halts, data retained
      ├─► [ Suspended ]  (admin action) — read-only
      └─► [ Archived → Purged ]  (offboarding, Part 2 lifecycle)
```

**Stages automatically added** (were implied but not listed in the prompt's example):
- **Forced password change** (first login) — security (P6.2).
- **Submitted-for-Approval / Request-Changes loop** — the client can be sent back to fix API or profile issues before activation.
- **Paused / Past-Due / Suspended** — non-happy-path lifecycle states (billing lapse, admin suspend).
- **Offboarding (Archive → Purge)** — export + deletion, mirrors Part 2's client lifecycle and GDPR (P6.6).
- **Continuous Learning loop** — analytics feed back into planning/strategy.

See Deliverable **15.1** for the formal journey map with entry/exit conditions per state.

---

## 2. First Login Experience

**Goal:** within 60 seconds the client understands *what this is, how it works, what to do next, and how long it takes.*

**Sequence after credential login:**
1. **Forced password change** (must_change_password, P6.2) — cannot proceed until done.
2. **Welcome screen** — one sentence value prop ("Your automated YouTube studio"), a 3-step "how it works" (Plan → Generate → Publish), and an explicit **time-to-value estimate** ("~15 minutes to first automated video plan").
3. **Interactive product tour** — guided, dismissible spotlight over the real dashboard shell (not screenshots), highlighting: where plans appear, where to review videos, where automation status lives, where support is.
4. **Setup progress tracker** — a persistent checklist widget (Profile ▸ APIs ▸ Subscription ▸ Submit) with % complete, visible until activation.

**Must provide:** Welcome screens · Interactive tour · Progress tracker · **Skip** (defer tour) · **Resume later** (setup is resumable; state persisted server-side) · **Help** launcher · **Video tutorials** (embedded, per step) · **Knowledge base** search · **Support access** (ticket/contact).

**Why:** premium onboarding reduces abandonment and support load; the progress tracker converts a scary "blank workspace" into a finishable task list. Everything is resumable because non-technical owners will not finish in one sitting.

---

## 3. Workspace Setup Wizard

The wizard authors a single versioned artifact: the **Workspace Profile** (ADR-012). Every automation default is read from it — nothing is hardcoded. The wizard is grouped into logical steps; each field declares **why it exists, how it affects automation, and required/optional.**

### 3.1 Field specification

| # | Field | Group | Req? | Why it exists / How it affects automation |
|---|---|---|---|---|
| 1 | Business Name | Identity | ✅ | Legal/display name; used in invoices, emails. |
| 2 | Workspace Name | Identity | ✅ | The channel/brand this workspace runs. |
| 3 | Company Logo | Brand Kit | ○ | Watermark, thumbnail, outro branding. |
| 4 | Brand Colors | Brand Kit | ○ | Thumbnail/overlay palette; on-brand generation. |
| 5 | Brand Fonts | Brand Kit | ○ | Thumbnail/subtitle typography. |
| 6 | Brand Voice (tone) | Brand Kit | ✅ | Steers script tone (e.g. "warm, moral, folktale"). |
| 7 | Business Category | Strategy | ✅ | High-level vertical for research + benchmarks. |
| 8 | Content Niche | Strategy | ✅ | Drives topic research (e.g. Indian moral fables). |
| 9 | Target Country | Strategy | ✅ | Trend region, upload-time timezone hints, compliance. |
| 10 | Primary Language | Strategy | ✅ | **Narration + subtitle language** (English default per Part 1). |
| 11 | Secondary Language | Strategy | ○ | Optional alt subtitle track / series variants. |
| 12 | Audience Age Group | Strategy | ✅ | Tone, complexity, thumbnail style. |
| 13 | Audience Interests | Strategy | ○ | Topic weighting + recommendations. |
| 14 | Competitor Channels | Strategy | ○ | Reference-learning inputs (Part 1). |
| 15 | Topics To Cover | Strategy | ○ | Positive topic seeds for the planner. |
| 16 | Topics To Avoid | Strategy | ✅* | Guardrails; hard filter in research/script. |
| 17 | Content Style | Creative | ✅ | Cinematic short-form default (9:16). |
| 18 | Storytelling Style | Creative | ✅ | Narrative arc template (Panchatantra-style). |
| 19 | Video Duration | Creative | ✅ | Scene count + cost envelope (30–60s default). |
| 20 | Upload Frequency | Cadence | ✅ | Scheduler cadence (Automatic Mode). |
| 21 | Upload Time | Cadence | ✅ | Publish slot in workspace timezone. |
| 22 | Manual vs Automatic Mode | Automation | ✅ | Default pipeline behavior (see §7). |
| 23 | AI Quality vs Cost Preference | Automation | ✅ | Scene-tier routing bias under the $ cap. |
| 24 | Default AI Providers | Automation | ✅ | Adapter selection per capability (ADR-003). |
| 25 | Default AI Models | Automation | ✅ | Model per capability, within routing policy. |
| 26 | Content Approval Workflow | Automation | ✅ | Per-stage auto vs manual matrix (§7, ADR-013). |
| 27 | Notification Preferences | Prefs | ✅ | Channels + categories the owner receives (§11). |
| 28 | Brand Kit (assets) | Brand Kit | ○ | Uploaded logos/fonts/colors bundle. |
| 29 | Character Preferences | Creative | ✅ | Primary = uploaded face; secondary = Indian female (Part 1). |
| 30 | Voice Preferences | Creative | ✅ | Narrator voice(s) per language. |
| 31 | Music Preferences | Creative | ○ | Mood/genre for background track selection. |
| 32 | Intro / Outro | Creative | ○ | Reusable bookend clips. |
| 33 | Watermark | Brand Kit | ○ | Persistent brand mark on renders. |
| 34 | Thumbnail Style | Creative | ✅ | Thumbnail template + text rules. |
| 35 | SEO Preferences | Strategy | ✅ | Title/description/tag policy + keyword bias. |
| 36 | Workspace Timezone | Cadence | ✅ | Anchors scheduling, analytics, reports. |

*16 "Topics To Avoid" marked required-with-safe-default (empty allowed but confirmed).

**Auto-added fields (useful, not in prompt):**
- **Series/Parts preference** — enable multi-part stories (Part 1 requirement).
- **Aspect ratio / format lock** — default 9:16 short-form.
- **Content rating / audience safety** — kids-safe vs general.
- **Default channel/destination** — which connected YouTube channel this workspace publishes to.
- **Cost ceiling per video** — surfaced, defaulting to the platform/plan cap ($1.55) but visible to the owner.
- **Consent/rights acknowledgement** — for uploaded face/likeness.

### 3.2 Wizard behavior
- **Progressive, resumable, skippable-where-optional**; each step validates before advancing but can be revisited.
- **Explainers everywhere** — every field shows *why* and *effect on automation* inline (non-technical owners).
- **Smart defaults** — sensible values pre-filled from Business Category + Target Country so a user can complete a minimum-viable profile fast.
- **Output** — a versioned **Workspace Profile** record; editing later creates a new version (revision history), and automation always reads the active version.

See Deliverable **15.11** for the wizard flow diagram.

---

## 4. API Configuration

The client connects providers through **provider adapters** (ADR-003); secrets go to the **Vault/secret store** (ADR-010), never shown after entry.

| Provider | Purpose | Required? | Where to get it | Validation | Health | Quota | Test |
|---|---|---|---|---|---|---|---|
| OpenAI | Research, script, scene JSON (single call) | ✅ (or Gemini) | platform.openai.com | key format + live ping | model list reachable | rate/credit check | sample completion |
| Gemini | Alt LLM provider | ○ | ai.google.dev | key + live ping | reachable | quota check | sample completion |
| ElevenLabs | Voice narration | ✅ | elevenlabs.io | key + voice list | voices reachable | char quota | 1s TTS sample |
| fal.ai | Image + motion generation | ✅ | fal.ai | key + account | model reachable | credit balance | tiny image gen (dry where possible) |
| YouTube | Publishing + analytics | ✅ | Google Cloud OAuth | OAuth connect | token valid | upload quota | channel fetch |
| Gmail | Transactional email (optional per-tenant) | ○ | Google Cloud OAuth | OAuth connect | token valid | send quota | test email |
| Supabase | Managed by platform (storage/DB) | (platform) | n/a | platform-managed | platform-managed | platform-managed | n/a |
| Future providers | Publishing/AI expansion | ○ | doc placeholder | adapter-generic | adapter-generic | adapter-generic | adapter-generic |

**Per provider the UI explains:** Purpose · Why required · Where to get the API · **Documentation link placeholder** · Validation result · Health check · Quota check · Connection test · **Error handling** (clear remediation) · **Replacement** (rotate key) · **Future provider switching** (swap adapter without losing config).

**Rules:** never expose secrets after save; store encrypted; validate with **free/cheap** calls only (no paid generation during setup — hard rule from Part 1). A provider can be **required-by-capability**: e.g., you need *an* LLM (OpenAI or Gemini), *a* voice provider, *a* visual provider, and *a* publishing target — the matrix enforces capability coverage, not specific brands.

See Deliverable **15.8** for the API Integration Matrix.

---

## 5. Client Dashboard (world-class)

Single glance answers: *what's happening today, is automation healthy, am I within budget, what needs me.* Every widget justified.

| Widget | Answers | Why it exists |
|---|---|---|
| Today's Plan | what publishes today | orient the owner instantly |
| Videos Scheduled | pipeline in flight | capacity/expectation |
| Videos Completed | rendered & ready | throughput |
| Videos Published | went live | outcome |
| Videos Failed | needs attention | surfaces problems fast |
| Automation Status | running / paused / stopped | trust + control |
| Current AI Cost | today's spend | margin/budget awareness |
| Monthly AI Usage | month-to-date spend vs plan | avoid overage |
| Remaining Credits | entitlement left | prevents surprise stops (ADR-004) |
| Upcoming Uploads | next N scheduled | planning |
| Pending Approvals | items awaiting human | unblock the queue |
| Notifications | unread alerts | nothing missed |
| Workspace Health | overall status roll-up | one-glance confidence |
| AI Health | provider/model status | root-cause failures |
| API Health | key validity/quota | pre-empt expiry outages |
| Publishing Health | channel/token status | avoid failed uploads |
| Recent Activity | last actions (who/what) | transparency + audit entry |
| Performance | views/CTR/retention snapshot | is it working? |
| Growth | subs/trend | the business outcome |
| Suggestions | next best actions | guidance |
| AI Recommendations | cost/quality/strategy tips | proactive improvement (§9) |

Widgets are **entitlement-aware** (hidden/locked features show upgrade affordances) and **empty-state coached** (P6.6) before data exists.

See Deliverable **15.10** (Analytics Matrix) for metric sourcing.

---

## 6. Content Management

Professional planning surface. The planner authors **plan items** that feed the pipeline.

**Views:** 30-Day Planner · Monthly · Weekly · Daily · **Content Calendar**.
**Stores/queues:** Drafts · Ideas · Research Queue · Approval Queue · Publishing Queue · Archive.
**Reuse & control:** Templates · Content Versions · Revision History · **Bulk Planning** · Recurring Content · **Seasonal Campaigns**.

**Behavior:**
- Planner can run in **mock ($0)** mode (current prototype) or, post-migration, produce **research-based AI plans** (ISS-B3/M6).
- Every plan item carries: topic, target date/slot, series/part, intended cost tier, and mode (manual/auto).
- **Versioning + revision history** on plans and items (who changed what, rollback).
- **Bulk + recurring + seasonal** let an owner fill a month or a festival campaign in one action.
- Calendar supports approve / disable / lock / edit / duplicate / move / regenerate / add / approve-all / export (matches prototype affordances; formalized here).

---

## 7. Complete AI Video Pipeline

Every stage defines: **Purpose · Input · Output · Provider · Manual Review · Auto Review · Logs · Notifications · Retry · Failure Handling · Cost Optimization · Future Expansion.** All model calls flow through the **AI Gateway** (ADR-005); cost governed against the per-video cap (Part 1).

| # | Stage | Purpose | Input → Output | Provider | Cost optimization |
|---|---|---|---|---|---|
| 1 | Research | gather trend/context | niche/profile → research notes | LLM (Gateway) | single structured call bundles research→SEO |
| 2 | Topic Selection | pick the story | research + plan item → chosen topic | LLM | reuse plan; no extra call |
| 3 | Keyword Research | SEO seeds | topic → keywords | LLM | part of the single call |
| 4 | Script Generation | write narration | topic → script | LLM | part of the single call |
| 5 | Scene Planning | shot list + importance | script → scenes (HIGH/MED/LOW) | LLM (Scene Decision Engine) | classification decides paid vs local |
| 6 | Prompt Generation | image/motion prompts | scenes → prompts | LLM | part of the single call; prompt_cache |
| 7 | Image Generation | keyframes | prompts → images | fal (Flux) | only HIGH scenes; asset-library reuse |
| 8 | Animation | motion clips | keyframes → clips | fal (motion) / local FFmpeg | fal only when motion required; else Ken-Burns local |
| 9 | Voice Generation | narration audio | script → audio | ElevenLabs | cache per script hash |
| 10 | Music Selection | background track | mood → track | library (local) | reuse licensed library, no gen cost |
| 11 | Subtitle Generation | captions | script/audio → subtitles | local | no paid call; English default |
| 12 | Video Rendering | compose | assets → 9:16 video | local FFmpeg | non-generative compositing is free |
| 13 | Thumbnail Creation | CTR asset | scene/brand → thumbnail | fal or template | template-first; gen only if needed |
| 14 | SEO Optimization | title/desc/tags | keywords → metadata | LLM | part of the single call |
| 15 | Quality Validation | automated QC | video → pass/flag | rules + optional LLM | cheap checks first |
| 16 | Approval | human/auto gate | video → approved | (policy) | no cost |
| 17 | Scheduling | slot it | approved → scheduled | scheduler | no cost |
| 18 | Publishing | upload | scheduled → live | YouTube adapter | ret#try w/ backoff |
| 19 | Analytics | measure | video id → metrics | YouTube analytics | batched pulls |
| 20 | Continuous Learning | improve | metrics → strategy/recommendations | LLM (batched) | periodic, not per-video |

**Cross-cutting per stage:**
- **Logs** — every stage writes a structured stage log (input hash, provider, cost, duration, result).
- **Notifications** — failures and gate-arrivals notify per the Notification Matrix (§11).
- **Retry strategy** — idempotent stages auto-retry with backoff; paid stages retry only within the cost cap and only after policy allows.
- **Failure handling** — a failed stage parks the item in an actionable error state (never silent); dependent stages don't run.
- **Manual/Auto review** — governed per stage by the approval matrix (§below), not a global flag.

See Deliverable **15.5** for the pipeline diagram.

---

## 8. Manual vs Automatic Mode (per-stage, hybrid)

Mode is a **per-stage policy**, not one global switch (ADR-013). This reconciles and generalizes the prototype's auto-approve matrix.

**Manual Mode (per stage):** pipeline **pauses** at the stage → allow edit · regenerate · approve · rollback.
**Automatic Mode (per stage):** pipeline **continues** → shows progress · allows **emergency stop** · allows mid-run **intervention** (grab a running item back to manual).
**Hybrid (default):** most stages auto; **high-risk/paid stages** (e.g., paid image/motion, publishing) default to manual until the owner trusts the workspace, then can be flipped to auto.

**Global controls:** Emergency Stop (halt all automation), Pause/Resume, per-item "take control," and a workspace-wide "require approval before any paid stage" safety toggle (defaults ON, aligns with Part 1's paid-run permission rule).

See Deliverable **15.6** for the workflow diagram.

---

## 9. Workspace Modules (complete hierarchy)

Grouped so navigation matches the client's mental model. (Reconciled with the P6.4 prototype nav: Home/Content/Production/Library/Automation/Insights/Account.)

- **Home:** Dashboard · Activity Timeline · Notifications
- **Plan:** Content Planner · Calendar · Ideas · Research Queue · Templates
- **Produce:** Automation (Pipeline) · Approvals · Manual Studio · Quality/QC
- **Library:** Brand Kit · Character Library · Voice Library · Music Library · Asset Library · Scene Library · Prompt Library · Thumbnail Center
- **Publish:** Publishing · Channels · Schedule · YouTube Connection
- **Insights:** Analytics · Performance · Forecasts · Recommendations · Workspace Health
- **Assistant:** AI Assistant (§10)
- **Account:** Workspace Settings · Team · Roles · Permissions · Billing · Subscription · Usage · Credits · API Management · Security · Audit Logs · Integrations
- **Help:** Support · Knowledge Base · Feedback · Feature Requests
- **Future (flagged, not built):** Marketplace · Plugin Support · White Label · Mobile/Desktop App

**Additional modules identified (not in prompt list):** Music Library (was implied), Scene Library, QC/Quality module, Activity Timeline as a first-class surface, Channels manager (multi-channel), Integrations hub (webhooks/exports).

See Deliverables **15.2/15.3/15.4** for sitemap, navigation, and hierarchy.

---

## 10. Workspace AI Assistant

A **tenant-scoped, read-only, propose-only** copilot — the workspace mirror of the platform Assistant (ADR-008, extended by **ADR-014**). It reads only *this workspace's* data + a help/runbook index; it **never** mutates data without explicit owner approval and never sees other tenants.

**Answers:** What should I post today? · Why did this automation fail? · How can I improve CTR? · Which AI provider is cheapest for me? · How can I reduce my cost? · Generate a content strategy · Recommend improvements · Suggest trends.
**Acts by proposal:** it can *draft* a plan, *suggest* a routing change, *propose* a schedule — each surfaced as a confirmable action the owner applies. No silent writes.

---

## 11. Notifications

One **event-driven notification service** (reuses the platform event bus, ADR-007; formalized by **ADR-016**) with **per-user channel preferences**.

**Channels:** Email · In-App · Push (future) · Webhook (future).
**Categories:** Failures · Publishing · Approvals · Credits (low/exhausted) · API Expiry · Subscription · Renewal · Warnings · Recommendations · Security Alerts.

See Deliverable **15.9** for the Notification Matrix (category × channel × default).

---

## 12. Analytics

Complete client analytics, sourced and forecastable.

**Metrics:** Growth · Views · Subscribers · CTR · Retention · Publishing Success · AI Cost · Automation Success · Content Performance · SEO Performance · Thumbnail Performance · Voice Performance · Provider Performance · Workspace Health · Business Growth · Forecasts · Recommendations.

**Architecture:** analytics are **rollup-backed** (nightly aggregation, ADR-007) for scale; real channel metrics come from the **YouTube analytics adapter** (post-migration; today's prototype is not yet wired — ISS-P3-05). Forecasts + recommendations reuse the platform intelligence capabilities (Part 2 §11) scoped to the tenant.

See Deliverable **15.10** for the Analytics Matrix (metric → source → cadence).

---

## 13. Settings & Security

**Settings groups:** General · Brand · Automation · Publishing · Notifications · Security · API · Billing · Subscription · Users · Storage · AI Models · Content Rules · Approvals · Backups · Exports · **Danger Zone** (delete workspace / reset). All settings write to the versioned Workspace Profile or its sub-configs.

**Security (enterprise workspace):** RBAC · Sessions · API Secrets (Vault) · Audit Logs · Encryption · Device Management (future) · **2FA-ready** (real TOTP already in P6.6) · Recovery · Emergency Access. Aligns with Part 2's platform Security Center; the workspace surface is the tenant-scoped view.

---

## 14. Future Expansion (no redesign required)

The workspace is built on abstractions so these need **config/adapters, not re-architecture**:
- **Publishing targets** are platform-agnostic destinations (**ADR-015**): Instagram · Facebook · TikTok · LinkedIn · X · Pinterest · Blogs · Podcasts.
- **AI providers** are adapters (ADR-003): future LLM/voice/visual providers drop in.
- **Marketplace / Plugins / White Label** ride on copy-on-use library (ADR-006) + entitlements (ADR-004) + branding engine (P6.1).
- **Mobile / Desktop App** consume the same API surface (Part 2 §2.5 public API / webhooks).

---

## 15. Required Deliverables

### 15.1 Complete Client Journey Map
The state machine in §1, with entry/exit conditions:

| State | Entry condition | Exit condition | Next |
|---|---|---|---|
| Provisioned | admin creates client | credentials delivered | First Login |
| First Login | valid credential login | password changed | Welcome & Tour |
| Welcome & Tour | first auth session | tour done/skipped | Setup Wizard |
| Setup Wizard | profile incomplete | required profile fields valid | API Configuration |
| API Configuration | capabilities uncovered | required capabilities connected+validated | Subscription |
| Subscription | plan unselected | plan selected | Submitted for Approval |
| Submitted for Approval | submit clicked | admin decision | Approval / Request-Changes |
| Request-Changes | admin returns it | client fixes | back to Wizard/API |
| Approved / Activated | admin approves | activation applied | Dashboard |
| Daily Operations | activated | (steady state) | Growth loop |
| Paused / Past-Due | billing lapse | payment cured | Daily Operations |
| Suspended | admin suspend | admin reactivate | Daily Operations |
| Archived → Purged | offboarding | export + retention window | (end) |

### 15.2 Workspace Sitemap
```
/ (Dashboard)
├─ /activity
├─ /notifications
├─ /plan
│  ├─ /plan/planner            (30-day/monthly/weekly/daily)
│  ├─ /plan/calendar
│  ├─ /plan/ideas
│  ├─ /plan/research
│  └─ /plan/templates
├─ /produce
│  ├─ /produce/pipeline        (automation)
│  ├─ /produce/approvals
│  ├─ /produce/studio          (manual editing)
│  └─ /produce/qc
├─ /library
│  ├─ /library/brand-kit
│  ├─ /library/characters
│  ├─ /library/voices
│  ├─ /library/music
│  ├─ /library/assets
│  ├─ /library/scenes
│  ├─ /library/prompts
│  └─ /library/thumbnails
├─ /publish
│  ├─ /publish/queue
│  ├─ /publish/channels
│  ├─ /publish/schedule
│  └─ /publish/youtube
├─ /insights
│  ├─ /insights/analytics
│  ├─ /insights/performance
│  ├─ /insights/forecasts
│  ├─ /insights/recommendations
│  └─ /insights/health
├─ /assistant
├─ /account
│  ├─ /account/settings        (grouped, §13)
│  ├─ /account/team
│  ├─ /account/roles
│  ├─ /account/billing
│  ├─ /account/subscription
│  ├─ /account/usage
│  ├─ /account/credits
│  ├─ /account/api             (API Management)
│  ├─ /account/security
│  ├─ /account/audit
│  └─ /account/integrations
└─ /help
   ├─ /help/support
   ├─ /help/kb
   ├─ /help/feedback
   └─ /help/feature-requests
Setup (pre-activation): /welcome · /setup (wizard) · /setup/api · /setup/subscription · /setup/review
```

### 15.3 Workspace Navigation Structure
Primary groups (left nav): **Home · Plan · Produce · Library · Publish · Insights · Assistant · Account · Help.** Global chrome: top bar (workspace switcher only if user belongs to multiple, notifications bell, Cmd+K palette, user menu), setup progress tracker (until activated), announcements banner. Entitlement-locked items render with an upgrade affordance rather than disappearing.

### 15.4 Workspace Module Hierarchy
See §9. Three tiers: **Group → Module → Sub-view.** Every module maps to exactly one permission scope (Deliverable 15.7) and one nav group (15.3).

### 15.5 AI Pipeline Diagram
The 20-stage flow in §7 (Research → … → Continuous Learning), with the Learning loop feeding Planning. Paid stages (7, 8, 13) and publishing (18) are gate-marked.

### 15.6 Manual vs Automatic Workflow Diagram
```
              ┌──────────────── per-stage policy (matrix) ───────────────┐
plan item ──► stage ──? MANUAL: pause → [edit|regenerate|approve|rollback] ─► next
                   └─? AUTO:   run → show progress ─┬─ ok ─► next
                                                    ├─ emergency stop ─► halt
                                                    └─ intervene ─► convert to MANUAL
Global: Emergency Stop · Pause/Resume · "require approval before any PAID stage" (default ON)
```

### 15.7 Workspace Permission Matrix
Roles: **Owner · Manager · Editor · Reviewer · Publisher · Viewer** (+ custom). Capabilities are tenant-scoped; disjoint from platform permissions (Part 2).

| Capability | Owner | Manager | Editor | Reviewer | Publisher | Viewer |
|---|---|---|---|---|---|---|
| workspace.settings | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| billing/subscription | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| team.manage / roles | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| api.manage (secrets) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| plan.create/edit | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| pipeline.run/regenerate | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| content.edit (studio) | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| approve (review gate) | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| publish | ✅ | ✅ | ⛔ | ⛔ | ✅ | ⛔ |
| library.manage | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| analytics.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| audit.view | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| assistant.use | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| security (2FA/sessions) | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

Custom roles = any subset of the above (owner-defined).

### 15.8 API Integration Matrix
See §4 table (provider × purpose × required × source × validation × health × quota × test), plus capability coverage rule: **{LLM} + {Voice} + {Visual} + {Publishing target}** must each be satisfied by at least one connected provider before activation.

### 15.9 Notification Matrix
Default routing (owner can override per category):

| Category | In-App | Email | Push(future) | Webhook(future) |
|---|---|---|---|---|
| Failures | ✅ | ✅ | ○ | ○ |
| Publishing (success) | ✅ | ○ | ○ | ○ |
| Approvals (needed) | ✅ | ✅ | ○ | ○ |
| Credits low/exhausted | ✅ | ✅ | ○ | ○ |
| API expiry | ✅ | ✅ | ○ | ○ |
| Subscription/Renewal | ✅ | ✅ | ○ | ○ |
| Warnings | ✅ | ○ | ○ | ○ |
| Recommendations | ✅ | ○ | ○ | ○ |
| Security alerts | ✅ | ✅ | ○ | ○ |

### 15.10 Analytics Matrix
| Metric | Source | Cadence |
|---|---|---|
| Views / Subscribers / CTR / Retention | YouTube Analytics adapter | daily rollup |
| Publishing Success | publish logs | real-time + daily |
| AI Cost / Provider Performance | AI Gateway usage | real-time + daily |
| Automation Success | pipeline stage logs | daily |
| Content / SEO / Thumbnail / Voice Performance | join(YouTube metrics × asset metadata) | daily |
| Workspace Health | health aggregator | real-time |
| Business Growth / Forecasts / Recommendations | intelligence (Part 2 §11), tenant-scoped | nightly |

### 15.11 Workspace Setup Wizard Flow
```
Welcome ─► Identity ─► Brand Kit ─► Strategy(niche/audience/topics) ─► Creative(style/character/voice)
   ─► Cadence(frequency/time/timezone) ─► Automation(mode/quality-cost/approval matrix)
   ─► API Configuration (capability coverage) ─► Subscription (plan) ─► Review ─► Submit for Approval
   (resumable at any step; optional steps skippable; each field explained)
```

### 15.12 Missing Feature Report
See §16.

### 15.13 Architecture Improvement Suggestions
See §17.

### 15.14 Migration Backlog Updates
Applied to `MIGRATION-BACKLOG.md` — items **ISS-P3-01…12** (see §18.1).

### 15.15 ADR Updates
Applied to `product-bible/ADR.md` — **ADR-011…016** (see §18.2).

---

## 16. Missing Feature Report (gaps found while designing Part 3)

**Enterprise capabilities missing / under-specified in the current prototype:**
1. **Full Workspace Profile** — setup today is onboarding-only; the ~40-field profile that *drives* automation does not exist as a versioned config (ISS-P3-01).
2. **Product tour + resumable setup + progress tracker** — no guided first-run experience (ISS-P3-02).
3. **Per-stage manual/auto policy** — only a coarse auto-approve exists; hybrid per-stage control missing (ISS-P3-03).
4. **Workspace AI Assistant** — not built (ISS-P3-04).
5. **Real analytics ingestion** — YouTube analytics adapter + rollups missing; dashboards are placeholders (ISS-P3-05).
6. **Creative libraries** — Music Library, Scene Library, Thumbnail Center as first-class modules missing (ISS-P3-06).
7. **Planning depth** — content versions, revision history, templates, bulk/recurring/seasonal campaigns missing (ISS-P3-07).
8. **Notification completeness** — API-expiry, subscription, security categories + per-user channel prefs missing (ISS-P3-08).
9. **Full RBAC role set** — Manager/Editor/Reviewer/Publisher/Viewer + custom roles beyond seeded basics (ISS-P3-09).
10. **Workspace health aggregation** — unified Workspace/AI/API/Publishing health surface missing (ISS-P3-10).
11. **Help system** — Knowledge Base, Support Center, Feedback, Feature Requests in-workspace missing (ISS-P3-11).
12. **Multi-channel destinations** — publishing tied to one channel; publishing-target abstraction missing (ISS-P3-12; overlaps ISS-B1/E1).

**Already tracked elsewhere (referenced, not duplicated):** pipeline↔engine wiring (ISS-A2/M4), per-tenant credentials/Vault (ISS-B2/C3/M2-M3), entitlements/quota engine (ISS-P2-02), AI-planner research (ISS-B3/M6), billing/Stripe (ISS-P2-04/M9), impersonation (ISS-P2-01).

## 17. Architecture Improvement Suggestions

1. **Single versioned Workspace Profile as the one config source** — eliminates scattered settings and hardcoding; automation reads the active version only (ADR-012).
2. **Lifecycle state machine over ad-hoc flags** — model the whole journey (incl. Paused/Suspended/Archived) as explicit states so UI, entitlements, and automation gate consistently (ADR-011).
3. **Per-stage policy matrix instead of a global manual/auto toggle** — safer, more flexible, and reconciles the existing auto-approve concept (ADR-013).
4. **Publishing-target abstraction now** — even while YouTube-only, model destinations generically so IG/TikTok/etc. are pure config later (ADR-015).
5. **Unified event-driven notification service** — one bus, many channels, per-user prefs; avoids per-feature notification code (ADR-016).
6. **Capability-coverage validation** (not brand-specific) at activation — future-proofs provider swaps and prevents half-configured workspaces (§4).
7. **Rollup-backed analytics from day one** — design metrics as aggregates so dashboards scale to millions of rows (ADR-007 reuse).
8. **Entitlement-aware UI everywhere** — locked features show upgrade paths (growth lever) rather than 404s.

## 18. Governance updates

### 18.1 Migration Backlog — new items (added to `MIGRATION-BACKLOG.md`)
`ISS-P3-01 … ISS-P3-12` per §16, mapped mostly to a new epic **M10 (Client Workspace Experience)** with cross-links to M4 (pipeline), M6 (AI planner/billing), M8 (platform intelligence reuse).

### 18.2 ADR — new records (added to `product-bible/ADR.md`)
- **ADR-011** — Client lifecycle is an explicit state machine; UI/entitlements/automation gate on state.
- **ADR-012** — A single versioned **Workspace Profile** is the sole source of automation config (no hardcoding).
- **ADR-013** — Manual vs Automatic is a **per-stage policy matrix**, not a global toggle; paid stages default to manual.
- **ADR-014** — The **Workspace AI Assistant** is tenant-scoped, read-only, propose-only (workspace mirror of ADR-008).
- **ADR-015** — Publishing uses a **platform-agnostic destination abstraction**; new networks are config/adapters.
- **ADR-016** — Notifications run through **one event-driven service** with per-user channel preferences.

---

---

## 19. Revision 1 — Enterprise Enhancements

Revision 1 **adds** the following without removing anything above. Where a capability overlaps an existing surface, it **improves that surface** rather than duplicating it (mappings noted). The overarching change is §19.11 (Workflow-Driven Architecture), which reframes how every module below is understood: **jobs & workflows are the product; UI only visualizes and controls them** (ADR-017).

### 19.1 AI Automation Timeline (Live Workflow)
*Improves `/produce/pipeline` (§7) — the pipeline page becomes a live, alive workflow timeline, not a static list.*

A per-video **live timeline** rendering the 20-stage workflow (§7) in real time. Always shows: **Current Stage · Completed Stages · Upcoming Stages · Estimated Remaining Time · Current AI Provider · Current AI Model · Cost Consumed (running) · Retry Status · Failure Reason · Logs · Estimated Completion Time.** Every stage node is **openable** to inspect input/output/logs/cost for that stage. Backed by the stage-log stream (§7 "Logs") and the AI Gateway cost feed (ADR-005). Design intent: automation *feels alive* — the client watches their video being built.

### 19.2 AI Cost Breakdown Per Video
*Improves the AI-cost widgets (§5) and Analytics (§12) with a per-video drill-down.*

For every video: **Total AI Cost · Cost by Provider · Cost by Stage · Estimated Cost · Actual Cost · Tokens Used · Rendering Cost · Voice Cost · Image Cost · Animation Cost · Future Cost Prediction.** Estimate-vs-actual variance is highlighted so the client sees where money went and where it will go. Sourced from AI Gateway usage records (per stage/provider) + local render accounting. Feeds the Estimator (§19.6) and Business Insights (§19.10 cost-saving).

### 19.3 Automation Sandbox
*New mode wrapping the pipeline; complements the per-stage manual/auto matrix (§8, ADR-013).*

Before production, a **Sandbox** allows: **Test Run · Dry Run · Preview Mode · Partial Pipeline Testing · Provider Testing · Publishing Simulation.** **Hard guarantee:** no production content is ever published in sandbox mode — the Publishing adapter is stubbed to a simulation (ADR-019). Sandbox runs are labeled, cost-capped (prefer $0 dry runs per Part 1), and never count against real credits unless a provider test explicitly incurs a validated micro-cost the owner confirms.

### 19.4 AI Quality Score
*New post-render evaluation; feeds the Approval gate (§7 stage 16) and Publishing Readiness.*

After each completed video, auto-generate an **Overall Quality Score** plus sub-scores: **Script · Visual · Voice · Animation · Subtitle · SEO · Thumbnail · Publishing Readiness.** **How it's calculated:** each dimension runs a rules-based check (completeness, technical validity, brand/profile conformance) optionally augmented by an LLM/AI evaluator via the Gateway; sub-scores are weighted (weights configurable in the Workspace Profile) into the overall score. Scores are **explainable** (each shows the factors that moved it) and support **pluggable future AI-evaluation providers** (adapter, ADR-018). Low scores can auto-route an item back to manual review.

### 19.5 Workspace Readiness Score
*New; consumes the same signals as Workspace Health (§5) but scored for setup completeness/growth.*

A **Workspace Readiness** score evaluating: **Brand Setup · API Configuration · Automation Configuration · Publishing Setup · Notifications · Billing · Security · Storage · Integrations · Overall Readiness.** Each dimension yields a status + weighted contribution, and the system emits **prioritized recommendations** to raise readiness (ties into the Success Checklist §19.9 and Insights §19.10). Surfaces during setup and persists on the dashboard until 100%.

### 19.6 AI Credit & Cost Estimator
*Improves the Setup Wizard (§3) automation step and the dashboard cost widgets (§5) — pre-run forecasting.*

**Before** automation starts, estimate: **Daily Cost · Weekly Cost · Monthly Cost · Cost Per Video · Cost Per Short · Cost Per Long Video · Expected AI Credits · Storage Usage · Rendering Time.** Estimates derive from the chosen cadence (§3), scene-tier routing, provider/model prices (registry), and historical actuals (§19.2). The client can **optimize before running** (e.g., shift quality/cost preference, change frequency, swap providers) and immediately see the projection change. Enforced against plan entitlements (ADR-004).

### 19.7 Workspace Templates
*Improves the Setup Wizard (§3) — a template pre-fills the Workspace Profile.*

Reusable **Workspace Templates**: Story Channel · History · Kids · Finance · Education · Healthcare · Documentary · Motivation · Technology · News · Podcast · Custom. Selecting a template auto-configures: **Brand defaults · Workflow · Prompt Defaults · Publishing settings · AI Models · Automation Rules.** Templates write into the versioned Workspace Profile (ADR-012), so they remain a starting point the owner can edit; the platform may also expose **platform-curated master templates via copy-on-use** (ADR-006). Kids/News templates carry stricter content-safety defaults.

### 19.8 AI Learning Center
*New Help-group module (`/help/learn`); complements Knowledge Base (§9).*

An in-workspace **Learning Center** teaching: Prompt Engineering · SEO · Storytelling · Thumbnail Optimization · Automation Best Practices · Cost Optimization · Publishing Strategy · AI Model Selection · Workflow Optimization. Content is structured (lessons/guides/videos) and **context-aware** — the AI Assistant (§10) and Insights (§19.10) can deep-link a client to the exact lesson that fixes their current gap. Reduces support load, increases adoption.

### 19.9 Workspace Success Checklist
*Improves the setup progress tracker (§2) — extends it through the whole activation-to-stable journey.*

A visual, progress-tracked **Success Checklist**: Workspace Created · Brand Configured · APIs Connected · YouTube Connected · First Content Plan · First Automation · First Published Video · Analytics Active · Automation Stable · 100% Ready. Each item links to the action that completes it; the checklist is the client-facing companion to the Readiness Score (§19.5) and maps onto the lifecycle state machine (§1).

### 19.10 Business Insights Engine
*Improves Insights/Recommendations (§9, §12) — goes beyond raw analytics to active guidance.*

Beyond analytics, an **Insights Engine** that actively helps the client grow, recommending: Best Upload Time · Best Video Duration · Best AI Provider · Best Thumbnail Style · CTR Improvement · SEO Recommendations · Cost-Saving Suggestions · Audience Growth · Automation Optimization · Trend Recommendations. Recommendations are **explainable and actionable** (each proposes a concrete change the owner confirms — never auto-applied), reusing the tenant-scoped intelligence capabilities (Part 2 §11) and the Assistant's propose-only contract (ADR-014).

### 19.11 Workflow-Driven Architecture (foundational reframe — ADR-017)
The workspace is **not** a set of isolated pages. It is a set of **Jobs & Workflows**; every page merely **visualizes or controls** them. This is the organizing principle for all of Part 3.

**Canonical jobs** (each a first-class, observable, retryable unit with input/output/status/logs/cost):

```
Content Planning Job ─► Research Job ─► Script Job ─► Scene Planning Job ─► Prompt Generation Job
   ─► Image Generation Job ─► Animation Job ─► Voice Job ─► Subtitle Job ─► Rendering Job
   ─► SEO Job ─► Publishing Job ─► Analytics Job ─► Optimization Job
```

**Consequences of the reframe:**
- The **AI Video Pipeline** (§7) is the composition of these jobs; the **Live Timeline** (§19.1) is their real-time visualization; the **Cost Breakdown** (§19.2) is their per-job accounting; the **Quality Score** (§19.4) evaluates their outputs; the **Sandbox** (§19.3) runs them without side effects.
- Every module in §9 is redefined as a **view/controller over jobs**, not a data page: the Planner *controls* the Planning Job; Approvals *controls* gate transitions; Publishing *controls* the Publishing Job; Insights *reads* Analytics/Optimization jobs.
- Jobs are **uniform** — same lifecycle (queued → running → paused → succeeded/failed → retrying), same observability (logs, cost, timing), same control surface (run/pause/retry/cancel/rollback). This is what makes the Manager/Queue (Part 2 §2.3, ISS-P2-05) and the workspace timeline consistent.
- **Manual/Auto (§8)** is a per-job policy; **entitlements (ADR-004)** meter jobs; **notifications (§11)** fire on job events; **the AI Gateway (ADR-005)** executes a job's model calls.

### 19.12 Deliverable reconciliations (Revision 1)

**Sitemap additions** (extends §15.2):
```
/produce/pipeline           → now the LIVE Automation Timeline (§19.1), per-video drill-in /produce/pipeline/[videoId]
/produce/pipeline/[id]/cost → per-video AI Cost Breakdown (§19.2)
/produce/sandbox            → Automation Sandbox (§19.3)
/produce/quality            → AI Quality Score reports (§19.4)
/insights/readiness         → Workspace Readiness Score (§19.5)
/insights/estimator         → AI Credit & Cost Estimator (§19.6)   (also embedded in Setup Wizard)
/insights/business          → Business Insights Engine (§19.10)
/setup/templates            → Workspace Templates picker (§19.7)   (front of the Setup Wizard)
/help/learn                 → AI Learning Center (§19.8)
/ (dashboard)               → hosts Success Checklist widget (§19.9)
```

**Navigation** (extends §15.3): **Produce** gains *Sandbox* and *Quality*; **Insights** gains *Readiness*, *Estimator*, *Business Insights*; **Help** gains *Learning Center*; the **Success Checklist** appears as dashboard chrome until 100%; the **Setup Wizard** opens with a **Templates** step.

**Permission Matrix** (extends §15.7) — new capabilities:

| Capability | Owner | Manager | Editor | Reviewer | Publisher | Viewer |
|---|---|---|---|---|---|---|
| timeline.view (live automation) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| cost.view (per-video breakdown) | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| sandbox.run | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| quality.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| readiness.view | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| estimator.use | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| templates.apply | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| insights.view (business engine) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (read) |
| learning.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Notification Matrix** (extends §15.9) — new categories:

| Category | In-App | Email | Push(future) | Webhook(future) |
|---|---|---|---|---|
| Quality Score low (below threshold) | ✅ | ○ | ○ | ○ |
| Cost overrun / estimate exceeded | ✅ | ✅ | ○ | ○ |
| Readiness dropped / setup gap | ✅ | ○ | ○ | ○ |
| Sandbox run complete | ✅ | ○ | ○ | ○ |
| New Business Insight available | ✅ | ○ | ○ | ○ |

**Analytics Matrix** (extends §15.10) — new metrics:

| Metric | Source | Cadence |
|---|---|---|
| AI Quality Score (overall + sub-scores) | quality evaluator (rules + AI, ADR-018) | per video |
| Per-video cost breakdown (provider/stage) | AI Gateway usage + render accounting | per video + daily rollup |
| Workspace Readiness Score | readiness aggregator | real-time |
| Cost estimates (day/week/month, per-video) | estimator (routing × price registry × actuals) | on-demand + nightly |
| Business Insights (best time/duration/provider/thumbnail…) | intelligence (Part 2 §11) tenant-scoped | nightly |

### 19.13 Missing-feature report (Revision 1 additions)
All 11 items are net-new capabilities vs the prototype and are tracked as **ISS-P3-R1-01…11** (§18.1 update). No existing Part-3 functionality was removed.

### 19.14 ADR updates (Revision 1)
- **ADR-017** — Workflow-Driven Architecture: jobs & workflows are the product; UI visualizes/controls them.
- **ADR-018** — Quality & Readiness scores are explainable, weighted, and use pluggable evaluator adapters.
- **ADR-019** — Automation Sandbox guarantees no production side effects (publishing is stubbed; runs cost-capped).
- **ADR-020** — Cost is estimated *before* runs and reconciled *after* (estimate-vs-actual) from AI Gateway accounting.

---

**End of Part 3 — Revision 1 · Status: APPROVED & LOCKED · Version: Revision 1.** Future changes only via an explicit **Revision 2** upgrade. Permanent Source of Truth for the Client Experience; conflicts resolve to Part 1, then Part 2. Awaiting the next Bible part (e.g., Part 4 — Workspace Setup Wizard deep-dive).
