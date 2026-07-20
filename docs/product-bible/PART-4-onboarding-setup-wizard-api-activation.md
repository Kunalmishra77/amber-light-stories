# Part 4 — Client Onboarding, Workspace Setup Wizard & API Activation Architecture (Revision 1)

**Status: APPROVED & LOCKED**
**Version: Revision 1**
**Date: 2026-07-20**

**Version history:**
| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 (Draft) | 2026-07-20 | Awaiting Review | Initial onboarding system: Setup Assistant, progress/validation/error-recovery/readiness engines, API Activation Center, first-automation "aha"; 14 deliverables; ADR-021…024; ISS-P4-01…12. |
| **Revision 1** | 2026-07-20 | **APPROVED & LOCKED** | +14 enhancements (§20): Onboarding Dashboard, Dynamic Wizard, Beginner/Advanced modes, Import & Clone, API Health Center, Brand Consistency Check, Onboarding AI Assistant, Readiness Certificate, Enterprise Org support, Onboarding Audit Trail, Gamification, Pre-activation Cost Estimation, First-Week Success Plan, Workspace Activation Checklist. Matrices/ADR/backlog/index reconciled. ADR-025…029 added; ISS-P4-R1-01…14 added. Future changes only via explicit **Revision 2**. |

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Part 3 (Client Experience & Workspace, Rev 1 Locked) defines the Client Experience. This document is the permanent Source of Truth for the complete **Client Onboarding System** once approved.

**Relationship to Part 3 (no duplication):** Part 3 §1 defined the lifecycle state machine, §2 the first-login experience, §3 the ~40-field Workspace Profile / Setup Wizard, §4 the API-config matrix, §19.5/§19.9 the Readiness Score & Success Checklist. **Part 4 does not re-specify those — it deepens the *onboarding execution*:** the intelligent Setup Assistant, the progress/validation/error-recovery engines, the API Activation Center, subscription activation, and the first-automation "aha" experience. Where a Part 3 artifact is referenced, Part 4 **improves** it; it never redefines or removes it.

---

## 0. Reading guide
Sections 1–17 are the onboarding design narrative. Section 18 holds the **14 required deliverables** (journey diagram, flows, matrices, reports). Section 19 is governance (missing-feature report, improvements, ADR + backlog updates). Deliverable tables win over narrative on any conflict.

---

## 1. Onboarding philosophy

The platform behaves like an **intelligent onboarding coach**, not a software dashboard. Design goals, in priority order:
1. **Confidence** — a non-technical owner always knows what to do next and why.
2. **Activation** — reach the first published video (time-to-value) as fast as safely possible.
3. **Deflection** — answer questions inline so support tickets never need to be opened.
4. **Retention** — a successful, celebrated launch creates a habit.

Inspiration (not copied): Notion's guided empty-states, Shopify's setup checklist, Slack's progressive nudges, HubSpot's readiness scoring, Figma's contextual tips, Stripe's activation clarity. Our differentiator: onboarding an *AI YouTube business*, so we add **cost transparency, provider health, and a sandboxed first run** that generic SaaS onboarding lacks.

---

## 2. Complete Client Onboarding Journey (gap-filled)

Extends the Part 3 §1 lifecycle with the granular onboarding sub-states. The workspace is `provisioning` throughout this journey and only becomes `active` at the end.

```
Receive Credentials ─► Login Page ─► Secure Login ─► Force Password Change
   ─► Welcome Screen ─► Interactive Product Tour ─► Setup Assistant launches
   ─► Business Profile ─► Brand Setup ─► YouTube Channel Setup ─► API Activation
   ─► Workspace Configuration ─► Automation Preferences ─► Subscription Confirmation
   ─► Payment (if required) ─► Workspace Validation ─► Readiness Check
   ─► Submit for Approval ─► Super Admin Approval ─► Workspace Activation
   ─► Congratulations ─► Launch First Automation (guided, sandbox-first) ─► Enter Dashboard
```

**Auto-added stages (were implicit):**
- **Email verification** (or credential-delivery confirmation) before/at first login — proves the owner controls the inbox (security + notifications).
- **Consent & rights acknowledgement** — for uploaded face/likeness and content responsibility (legal), captured during Brand/Profile.
- **Request-Changes loop** — Super Admin can return the submission with specific fixes; the Assistant re-opens exactly the failing steps.
- **Resume / abandonment re-entry** — returning after leaving mid-onboarding drops the user at the exact saved step.
- **Grace/Pending states** — payment pending or approval pending keep the workspace read-only, not broken.
- **First-run sandbox** — the first automation runs sandbox-first (ADR-019 from Part 3) so the "aha" costs ~$0 and cannot mis-publish.

See Deliverable **18.1** (Onboarding Journey Diagram).

---

## 3. Interactive Setup Assistant (the coach)

A stateful assistant that guides, not a static wizard (ADR-021). Behaviors:
- **Step-by-step guidance** with plain-language intent for every step.
- **Setup-time estimate** — overall and per remaining step ("~12 min left").
- **Auto-save** — every field persists server-side on change; nothing is lost.
- **Resume** — returns the user to the exact step/scroll position.
- **Skip where appropriate** — optional steps are clearly skippable and revisitable.
- **Contextual help** — inline "why/how" + deep links to the Learning Center (Part 3 §19.8).
- **Short tutorials** — embedded per step.
- **Best-practice recommendations** — e.g., "channels in your niche publish at 7pm — set that as your slot."
- **Mistake detection** — the Validation Engine (§9) surfaces issues *as they happen*, not only at submit.
- **AI-powered suggestions** — the (read-only, propose-only) Assistant (Part 3 §10, ADR-014) can pre-fill a profile from the business name/niche, suggest topics, or recommend a template (Part 3 §19.7). All suggestions are confirmable, never auto-applied.

The Assistant is a **thin controller over the onboarding workflow** (consistent with the Workflow-Driven Architecture, ADR-017): each step is a job with state, validation, and logs.

See Deliverable **18.3** (Setup Assistant Flow).

---

## 4. Onboarding Progress System

A progress engine that always displays: **Overall Progress · Current Step · Remaining Steps · Estimated Time Remaining · Required Steps · Optional Steps · Completed Steps · Blocked Steps · Dependencies · Workspace Readiness · Success Checklist.**

**Rules:**
- Progress = weighted completion of **required** steps (optional steps add polish, not blocking).
- **Dependencies** are explicit (e.g., API Activation depends on Business Profile's chosen providers; Submit depends on Readiness ≥ threshold). Blocked steps show *what unblocks them*.
- Progress updates **reactively** as fields save and validations pass.
- The **Success Checklist** (Part 3 §19.9) is the celebratory front-end of this engine; the **Readiness Score** (Part 3 §19.5, §8 here) is its quality gate.

See Deliverable **18.4** (Workspace Readiness Flow) and **18.2** (Setup Wizard Flow).

---

## 5. Business Profile Setup

Deepens the Part 3 Workspace Profile with onboarding-specific business context. Each field: **why it exists · effect on automation · required/optional.**

| Field | Req? | Why / effect on automation |
|---|---|---|
| Business Name | ✅ | invoices, emails, legal identity |
| Workspace Name | ✅ | the channel/brand this workspace runs |
| Industry | ✅ | research benchmarks + template suggestion |
| Business Type | ○ | solo/agency/brand → seat & workflow defaults |
| Company Size | ○ | seat entitlements + team onboarding hints |
| Target Country | ✅ | trend region, timezone, compliance |
| Primary Language | ✅ | narration + subtitle language (English default, Part 1) |
| Secondary Language | ○ | alt subtitle track / series variants |
| Timezone | ✅ | scheduling, analytics, reports |
| Working Hours | ○ | preferred publish windows + notification quiet-hours |
| Brand Description | ✅ | steers script tone + visual prompts |
| Mission | ○ | long-term content strategy alignment |
| Vision | ○ | strategy + Insights recommendations |
| Audience | ✅ | tone, complexity, thumbnail style |
| Goals | ✅ | success metrics + Insights targets |
| Content Objectives | ✅ | planner topic weighting |
| Success Metrics | ✅ | which analytics the dashboard prioritizes |

**Auto-added:** *Consent/rights acknowledgement* (likeness + content responsibility), *Preferred contact email* (may differ from login), *Referral/how-did-you-hear* (onboarding analytics).

---

## 6. Brand Setup

Complete brand onboarding (feeds Brand Kit, Part 3 §9): **Logo · Brand Colors · Typography · Brand Voice · Writing Style · Storytelling Style · Visual Style · Thumbnail Style · Intro · Outro · Watermark · CTA Style · Content Personality · Brand Guidelines.**

**Behavior:** all optional-but-encouraged (a weak-brand warning appears in Validation, §9, without blocking); a selected **Workspace Template** (Part 3 §19.7) pre-fills sensible brand defaults; uploaded assets go to the tenant's private storage (never public — closes ISS-C2 intent); brand values write to the versioned Workspace Profile (ADR-012). Kids/News templates apply stricter brand-safety defaults.

---

## 7. YouTube Channel Setup

Complete channel onboarding, provider-abstracted as a **publishing destination** (Part 3 ADR-015):
- **Connect Existing Channel** (OAuth) · **Create Future Placeholder** (configure now, connect later) · **Multiple Channels** (future — destination list).
- **Channel Validation** (channel reachable) · **Permissions Check** (upload scope granted) · **Brand Account support**.
- Defaults captured: **Category · Country · Language · Upload Defaults · Playlist Strategy.**

**Behavior:** placeholder mode lets a client finish onboarding before their channel exists; automation then runs to *draft/scheduled* and holds at Publishing until a real channel is connected (surfaced by Publishing Health, Part 3 §5). Token validity is health-checked continuously and drives the API-expiry notification (§14).

---

## 8. API Activation Center

A premium, guided activation experience per provider (deepens Part 3 §4). Secrets always **encrypted in Vault** (ADR-010), never shown after entry.

| Provider | Purpose | Required features / scope | Free tier? | Validation → Health → Quota → Permission |
|---|---|---|---|---|
| OpenAI | research/script/scene/SEO (single call) | chat/completions | limited trial | key format → model reachable → credit → n/a |
| Gemini | alt LLM | generateContent | yes (quota) | key → reachable → quota → n/a |
| ElevenLabs | voice narration | TTS + voices | yes (chars) | key → voices → char quota → n/a |
| fal.ai | image + motion | model inference | pay-as-go | key → model → credit → n/a |
| YouTube | publish + analytics | upload + analytics scopes | free (quota) | OAuth → token valid → upload quota → **scope check** |
| Gmail | transactional email (optional) | send scope | free (quota) | OAuth → token valid → send quota → scope check |
| Supabase | storage/DB (platform-managed) | n/a | platform | platform-managed |
| Future providers | AI/publishing expansion | adapter-generic | varies | adapter-generic |

**Per provider the Activation Center defines:** Purpose · Required features · **API Acquisition Guide** (step-by-step to obtain the key) · **Official documentation placeholder** · Validation · Health Check · Quota Check · **Permission Check** · Rate Limits · **Estimated Cost** · **Free-Tier availability** · Connection Test · **Failure Handling** · **Retry Strategy** · **Replacement Strategy** (rotate) · **Future Provider Switching** (swap adapter, keep config).

**Capability-coverage rule (from Part 3 §4, enforced at submit):** the workspace must cover **{LLM} + {Voice} + {Visual} + {Publishing target}**; specific brands are interchangeable. Validation uses **free/cheap** calls only — **no paid generation during onboarding** (Part 1 hard rule).

See Deliverable **18.5** (API Activation Flow) and **18.6** (Validation Matrix).

---

## 9. Validation Engine

Validation is **continuous and contextual**, not a single submit-time gate (ADR-022). Each validation declares **trigger · severity · blocking? · behavior/remediation.** Optional-field issues **warn**; capability/security issues **block submit**.

| Validation | Trigger | Sev | Blocks submit? | Behavior / remediation |
|---|---|---|---|---|
| Invalid API key | on connect | High | ✅ (that capability) | inline error + acquisition guide + retry |
| Missing logo | brand step | Low | ⛔ (warn) | "add a logo for on-brand thumbnails" |
| Weak branding | brand step | Low | ⛔ (warn) | Readiness suggestion, not a block |
| Missing YouTube permission/scope | channel connect | High | ✅ | re-consent flow with exact scope |
| Insufficient AI credits | API/estimator | Medium | ⛔ (warn) | Estimator (Part 3 §19.6) + top-up hint |
| Missing payment (paid plan) | subscription | High | ✅ | resume at payment step |
| Invalid email | profile | Medium | ✅ | verification re-send |
| Missing required fields | any step | High | ✅ | jump-to-field |
| Duplicate workspace | profile submit | High | ✅ | conflict message (see §10) |
| Conflicting settings | config | Medium | ⛔ (warn) | explain conflict + suggested resolution |
| Expired tokens | any time | High | ✅ (for that provider) | reconnect flow + notification |
| Capability not covered | submit | Critical | ✅ | show which of LLM/Voice/Visual/Publish is missing |
| Missing consent/rights | profile | High | ✅ | consent checkbox required |

---

## 10. Error Recovery

Every failure has a defined recovery path — onboarding is **crash-safe and idempotent** (ADR-023): all step data autosaves server-side, so no client-side loss is fatal.

| Scenario | Detection | Recovery | Retry | Rollback | Notify | Audit |
|---|---|---|---|---|---|---|
| Browser closed | session resume | resume at saved step | n/a | none (saved) | — | login event |
| Internet lost | request failure | offline banner + local buffer → re-sync | auto on reconnect | none | in-app | — |
| Payment failed | processor callback | stay at payment; explain reason | manual retry | order not created | email + in-app | billing event |
| API failed (validation) | connection test | inline error + guide | backoff retry | key not saved on fail | in-app | api event |
| Approval rejected | admin action | reopen failing steps w/ notes | resubmit | workspace stays provisioning | email + in-app | approval event |
| Quota exceeded | quota check | show limit + upgrade/top-up | after top-up | none | in-app | usage event |
| Workspace already exists | uniqueness check | offer existing or rename | n/a | no duplicate created | in-app | conflict event |
| Session expired | auth check | re-auth → resume | re-login | none | in-app | auth event |
| Server error | 5xx | friendly error + auto-retry + support link | backoff | transaction rolled back | in-app | error event |
| Unexpected failure | catch-all | safe state + "we saved your progress" | n/a | last good state | in-app | error event |

See Deliverable **18.7** (Error Recovery Matrix).

---

## 11. Subscription Activation

Deepens Part 2 §7 (commercial) for the onboarding moment. Supports: **Trial · Paid · Enterprise · Upgrade · Downgrade · Renewal · Grace Period · Payment Failure · Pending Approval.**

**Behavior during onboarding:**
- Plan selection **provisionally attaches entitlements** (ADR-004); enforcement begins at activation.
- **Trial** activates immediately post-approval with trial limits; **Paid** requires successful payment before submit (validation §9); **Enterprise** routes to a manual/custom path (admin-assisted).
- **Payment failure** keeps the workspace in `provisioning`/grace, never half-activated.
- **Pending Approval** is a first-class state — the client sees a clear "awaiting review (~X hrs)" status with the Success Checklist showing everything else is done.

---

## 12. Workspace Readiness Engine (onboarding gate)

Before approval, compute per-dimension readiness (extends Part 3 §19.5 with the onboarding dimensions): **API · Brand · Content · Automation · Publishing · Notification · Security · Billing · Overall.** Each yields a weighted status + **prioritized recommendations**. A minimum overall threshold (config, e.g., all *required* dimensions green) gates **Submit for Approval**; optional gaps lower the score but don't block. Super Admin sees the same Readiness snapshot when reviewing (Part 2).

See Deliverable **18.4** (Workspace Readiness Flow).

---

## 13. First Automation Experience (the "aha" moment)

After activation, a guided, celebratory first run — **sandbox-first** (ADR-019) so it's ~$0 and cannot mis-publish:
```
Create First Content Plan ─► Generate First Script ─► Generate First Video (sandbox/preview)
   ─► Preview ─► Approve ─► Publish (first real publish, explicitly confirmed) ─► View Analytics ─► 🎉 Celebrate
```
Each step is coached, shows the Live Timeline (Part 3 §19.1) and running Cost Breakdown (Part 3 §19.2), and ends in an explicit celebration ("Your first automated video is live"). This is the retention hook: memorable, confidence-building, and cost-transparent. The single real publish is gated by the paid-run confirmation rule (Part 1).

---

## 14. Help System (onboarding)

Beginner-focused support woven through onboarding: **AI Assistant** (propose-only) · **Documentation** · **Video Tutorials** · **Interactive Guides** · **FAQs** · **Live Support (future)** · **Ticket System** · **Community (future)**. Help is **contextual** — each step surfaces the relevant guide/lesson (Learning Center, Part 3 §19.8) and a one-click "get help on this step" that pre-fills a ticket with step context.

---

## 15. Onboarding Notifications

Extends the Part 3 §11 event-driven notification service (ADR-016) with onboarding events. Channels: **Email · In-App** (push/webhook future).

| Event | Email | In-App | Timing |
|---|---|---|---|
| Credentials delivered | ✅ | — | at provisioning |
| Email verification | ✅ | — | at first login |
| Setup reminder (abandoned) | ✅ | ✅ | after inactivity |
| Validation failure (blocking) | ○ | ✅ | on occurrence |
| Submitted for approval | ✅ | ✅ | on submit |
| Approval decision (approve/changes/reject) | ✅ | ✅ | on admin action |
| Workspace activated | ✅ | ✅ | on activation |
| Subscription/payment status | ✅ | ✅ | on change |
| Security alert (new login/2FA) | ✅ | ✅ | on event |
| First automation success | ✅ | ✅ | on first publish |

See Deliverable **18.8** (Notification Matrix).

---

## 16. Onboarding Analytics

Track and continuously improve onboarding: **Completion Rate · Drop-off Rate · Average Completion Time · Most-Failed Step · API-Connection Success · Payment Success · Approval Time · Workspace-Activation Time.** Plus auto-added: **step-level time-on-step, resume rate, template adoption, support-ticket-per-onboarding, time-to-first-published-video (activation).**

**Architecture:** onboarding emits step events (start/complete/fail/skip/resume) to the event bus; funnel + rollups (ADR-007) power a platform-side onboarding funnel (Super Admin, Part 2) and per-cohort improvement. Privacy: aggregates only; no cross-tenant leakage.

See Deliverable **18.9** (Onboarding Analytics Matrix).

---

## 17. Onboarding Security

Secure by construction: **Encrypted Secrets (Vault) · Secure Sessions · Password Policies (P6.2) · Email Verification · Audit Logs · RBAC · Rate Limiting · Fraud Detection (future) · 2FA-ready (real TOTP, P6.6).** Every onboarding action is audited; credential validation and payment steps are rate-limited (reuses Part 3 ops helpers); secrets are write-only from the client's perspective. Consent/rights capture is auditable.

See Deliverable **18.10** (Security Matrix).

---

## 18. Required Deliverables

### 18.1 Complete Onboarding Journey Diagram
The flow in §2, rendered as sub-states of the Part 3 lifecycle (`provisioning` → `active`), with the Request-Changes loop and Resume re-entry as explicit edges. Entry: credential delivery. Exit: dashboard after first automation.

### 18.2 Setup Wizard Flow
```
Template pick (opt) ─► Business Profile ─► Brand Setup ─► YouTube Channel ─► API Activation
   ─► Workspace Config ─► Automation Preferences ─► Subscription ─► Payment(if paid)
   ─► Validation ─► Readiness Check ─► Submit for Approval
(resumable at any step; optional steps skippable; each field explained; autosave on change)
```

### 18.3 Interactive Setup Assistant Flow
```
launch ─► for each step: [explain why] ─► [prefill via AI suggestion?] ─► user input (autosave)
   ─► [validate live] ─► pass? advance : show remediation ─► [offer tutorial/help]
   ─► track progress + ETA ─► on exit: persist → on return: resume exact step
```

### 18.4 Workspace Readiness Flow
```
collect signals (API/Brand/Content/Automation/Publishing/Notification/Security/Billing)
   ─► score each (weighted) ─► overall score ─► recommendations
   ─► required dims all green? enable Submit : list blockers
```

### 18.5 API Activation Flow (per provider)
```
select provider ─► show acquisition guide + docs ─► enter key/OAuth
   ─► validate (format/live) ─► permission/scope check ─► health check ─► quota check
   ─► estimated cost shown ─► connection test (free/cheap) ─► save encrypted (Vault)
   ─► on fail: guide + retry(backoff) ; on rotate: replacement flow ; capability coverage updated
```

### 18.6 Validation Matrix
See §9 (validation · trigger · severity · blocks-submit? · behavior).

### 18.7 Error Recovery Matrix
See §10 (scenario · detection · recovery · retry · rollback · notify · audit).

### 18.8 Notification Matrix
See §15 (event · email · in-app · timing).

### 18.9 Onboarding Analytics Matrix
| Metric | Source | Purpose |
|---|---|---|
| Completion / Drop-off rate | step events funnel | find leaks |
| Avg completion time / time-on-step | step timestamps | reduce friction |
| Most-failed step | validation failures | fix worst step |
| API-connection success | activation events | provider UX quality |
| Payment success | billing events | monetization health |
| Approval time | approval events | ops SLA |
| Activation time (to active) | lifecycle events | onboarding speed |
| Time-to-first-published-video | first-automation events | true time-to-value |
| Template adoption / resume rate | wizard events | assistant effectiveness |
| Support tickets per onboarding | help events | deflection quality |

### 18.10 Security Matrix
| Control | Mechanism | When |
|---|---|---|
| Encrypted secrets | Vault/pgsodium (ADR-010) | on API save |
| Secure sessions | auth middleware + expiry | all steps |
| Password policy | strength + forced change (P6.2) | first login |
| Email verification | verification link/code | before/at first login |
| Audit logs | audit on every action | throughout |
| RBAC | onboarding = owner-only until team invited | throughout |
| Rate limiting | per-action limits (cred validation, payment) | validation/payment |
| 2FA-ready | TOTP (P6.6) | security step / post-activation |
| Fraud detection (future) | anomaly signals | payment/activation |
| Consent capture | auditable acknowledgement | profile/brand |

### 18.11 Missing Feature Report → §19.1
### 18.12 Architecture Improvement Suggestions → §19.2
### 18.13 ADR Updates → §19.3
### 18.14 Migration Backlog Updates → §19.4

---

## 19. Governance

### 19.1 Missing Feature Report (found while designing Part 4)
1. **Stateful, resumable onboarding engine** — current onboarding is a linear public wizard; no server-persisted step state / resume / abandonment re-entry (ISS-P4-01).
2. **Interactive Setup Assistant** (coach: ETA, prefill, best-practice, mistake detection) — missing (ISS-P4-02).
3. **Continuous Validation Engine** (live, contextual, severity-tiered, capability-coverage gate) — only basic per-field checks exist (ISS-P4-03).
4. **Error-recovery/idempotency layer** (crash-safe autosave, retry/rollback per scenario) — missing (ISS-P4-04).
5. **API Activation Center** (acquisition guides, permission/scope + quota + estimated-cost + rotation/replacement) — beyond the current basic validation (ISS-P4-05).
6. **YouTube channel setup depth** (placeholder mode, scope check, brand-account, playlist strategy, multi-channel-ready) (ISS-P4-06).
7. **Subscription activation states** (trial/paid/enterprise/grace/pending woven into onboarding) — ties to billing M9 (ISS-P4-07).
8. **Onboarding-gate Readiness Engine** (dimensioned, threshold-gated submit) — extends P3 readiness (ISS-P4-08).
9. **First-automation guided "aha" flow** (sandbox-first, celebrate) — missing (ISS-P4-09).
10. **Onboarding analytics funnel** (completion/drop-off/most-failed/time-to-value) — missing (ISS-P4-10).
11. **Onboarding help system** (contextual guides, ticket-with-context, tutorials) — missing (ISS-P4-11).
12. **Email verification + consent/rights capture** as first-class onboarding steps (ISS-P4-12).

**Already tracked (referenced, not duplicated):** onboarding-template manager (ISS-P2-11), impersonation (ISS-P2-01), entitlements engine (ISS-P2-02), payments/Stripe (ISS-P2-04/M9), per-tenant Vault/secrets (ISS-B2/C3/M2-M3), private asset bucket (ISS-C2), platform/tenant separation (ISS-A1/M1), Workspace Profile (ISS-P3-01), Templates (ISS-P3-R1-07), Readiness/Checklist (ISS-P3-R1-05/09), Sandbox (ISS-P3-R1-03).

### 19.2 Architecture Improvement Suggestions
1. **Model onboarding as a job/workflow** (ADR-017) — each step a persisted job with state/validation/logs; gives resume, audit, and analytics for free.
2. **Validation as a shared, declarative rule set** — same rules power live hints, submit-gating, and Super-Admin review; one source of truth, no drift.
3. **Capability-coverage over brand-specific requirements** — future providers slot in without touching onboarding logic (Part 3 §4, ADR-003).
4. **Readiness threshold is config, not code** — the platform can tune the activation bar per plan/segment.
5. **Sandbox-first first run** — de-risks the "aha" moment and reinforces cost transparency (ADR-019/020).
6. **Onboarding funnel telemetry from day one** — treat onboarding as a product with its own analytics, so it improves continuously.
7. **Contextual help + ticket-with-context** — deflect first, and when escalation happens, the ticket already carries the failing step.

### 19.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-021** — Onboarding is a stateful, resumable, idempotent **Setup Assistant** (server-persisted step state; coach, not form).
- **ADR-022** — Validation is a **continuous, declarative, severity-tiered** engine; capability-coverage gates submit; the same rules power live hints, submit-gate, and admin review.
- **ADR-023** — Onboarding is **crash-safe & idempotent**: every step autosaves server-side with defined retry/rollback per failure scenario.
- **ADR-024** — First automation is a **guided, sandbox-first "aha" flow** to activation; the single real publish is explicitly confirmed (Part 1 paid-run rule).

### 19.4 Migration Backlog updates
Items **ISS-P4-01 … ISS-P4-12** added under epic **M10 (Client Workspace Experience)** with cross-links to **M1** (activation/separation), **M9** (subscription/payment), **M8** (onboarding funnel telemetry, admin review). See `MIGRATION-BACKLOG.md`.

---

---

## 20. Revision 1 — Enterprise Onboarding Enhancements

Revision 1 **adds** the following without removing anything above. Overlaps **improve** existing surfaces (mappings noted); nothing is duplicated.

### 20.1 Client Onboarding Dashboard
*New surface at `/onboarding` (pre-activation control center); it is the front-end of the progress engine (§4) and Readiness engine (§12).*

Before the client enters the real workspace, a dedicated **Onboarding Dashboard** is the control center, always showing: **Overall Progress · Workspace Readiness Score · Completed Steps · Pending Steps · Estimated Remaining Time · API Connection Status · Subscription Status · Approval Status · Latest Notifications · AI Recommendations · Resume · Restart Wizard · Support Access.** It persists across sessions (ADR-021 state), and is the natural landing page whenever a `provisioning` workspace logs in.

### 20.2 Dynamic Setup Wizard
*Improves the Setup Wizard (§18.2) — steps are computed, not fixed (ADR-025).*

The wizard is **rules-driven and adaptive**: the visible step/field set is computed from **Subscription Plan · Target Country · Language · Selected Content Type · Business Category · AI Providers Selected · YouTube vs future platforms · Manual vs Automatic Mode · Beginner vs Advanced user**. Irrelevant steps are hidden; unnecessary configuration never appears. The rule set is **config-driven** (no hardcoding) and shares the same declarative engine as Validation (ADR-022), so eligibility and validation stay consistent.

### 20.3 Beginner / Advanced Modes
*Improves the Setup Assistant (§3) — two guidance intensities over the same underlying steps.*

- **Beginner:** explain everything · show videos/examples · recommend settings · lean on AI suggestions (propose-only).
- **Advanced:** minimal guidance · direct configuration · bulk setup · **import configuration** (§20.4) · power-user shortcuts.

Mode is chosen at first launch and switchable anytime; it changes *presentation/density*, never the required data or validations.

### 20.4 Import & Clone
*New capability feeding the Workspace Profile (ADR-012) via copy-on-use (ADR-006).*

Support: **Import Existing Workspace · Clone Existing Workspace · Import Configuration File · Import Brand Kit · Import Prompt Library · Import Automation Rules · Import Templates**, and **future migration from another platform** (adapter-based importer). Imports are **validated and previewed** before apply (Validation Engine, §9), write into the new workspace's versioned profile/libraries, and are fully audited (§20.10). Clone respects tenant isolation (a deep copy, never a shared reference).

### 20.5 API Health Center
*Improves API Activation (§8) — activation is a moment; Health Center is the permanent surface. Reconciles with Workspace/AI/API Health (Part 3 §5).*

After connection, a permanent **API Health Center** shows per provider: **Health · Status · Quota · Expiry · Remaining Credits · Provider Availability · Latency · Last Validation · Next Validation · Rotation Status · Connection History · Recommendations.** Continuous background health checks drive the API-expiry/quota notifications (§15) and the API readiness dimension (§12). Post-activation it lives in the workspace at `/account/api` (Part 3), so onboarding and steady-state share one component.

### 20.6 Brand Consistency Check
*Improves Brand Setup (§6) and Readiness (§12) — a pre-activation completeness gate for brand.*

Before activation, auto-verify: **Logo · Brand Colors · Typography · Voice · Thumbnail Style · CTA · Intro · Outro · Watermark**, producing a **Brand Completeness Score** with prioritized improvement recommendations. Weak brand **warns** (never hard-blocks, per §9) but lowers the Brand readiness dimension. Reuses the scoring contract of the AI Quality/Readiness scores (Part 3 ADR-018).

### 20.7 Onboarding AI Assistant
*Improves the Setup Assistant's AI (§3) — a dedicated, onboarding-scoped assistant (ADR-014 contract).*

A dedicated **onboarding assistant** answering: *Where do I get this API? · Why is this required? · Which plan should I choose? · How much will it cost? · What's the cheapest provider? · How long will setup take? · Can I skip this? · How do I reduce AI cost?* It is **read-only and propose-only** — it guides and can *offer* to prefill, but **never modifies settings automatically** (confirmable actions only). It deep-links to the Learning Center (Part 3 §19.8) and the Cost Estimator (§20.12).

### 20.8 Client Readiness Certificate
*New confidence artifact emitted at successful activation.*

On successful onboarding, generate a **Workspace Ready Certificate**: **Date · Workspace Version · Connected Providers · Security Status · Automation Status · Publishing Status · Readiness Score · Recommended Next Steps.** It is a shareable, audited record (a confidence + milestone artifact), snapshotting the workspace's activation state.

### 20.9 Enterprise Organization Support (future-proofing)
*Extends the tenancy model so onboarding never needs a redesign for enterprise (ADR-026).*

Onboarding is designed to later support: **Organizations · Departments · Business Units · Teams · Multiple Brands · Multiple Channels · Multiple Workspaces · Approval Chains · Regional Settings** — as an **optional tier above the workspace** (an org can own many workspaces; approval chains generalize the single Super-Admin approval; regional settings inherit down). Today's single-workspace onboarding is the degenerate case of this model, so no rework is required when enterprise arrives. Complements Part 2's tenancy and Part 3 ADR-015 (multi-channel).

### 20.10 Onboarding Audit Trail
*Improves the Security/audit posture (§17) — a dedicated, complete onboarding audit stream.*

Record **every** onboarding action: **Password Changed · API Connected · Payment Completed · Workspace Submitted · Approval Granted · Configuration Changed · Validation Failed · Retry · Import/Clone · Mode Switched · Certificate Issued**, etc. Every entry: actor, timestamp, before/after (where applicable), result. Feeds the Super-Admin review (Part 2) and onboarding analytics (§16). Immutable + queryable.

### 20.11 Gamification (optional)
*New optional motivation layer over the Success Checklist (Part 3 §19.9) and progress engine (§4).*

Optional motivation: **Progress Badges · Setup Milestones · 100% Ready Badge · First Automation Badge · First Publish Badge.** Purely additive and dismissible (never blocks or nags power users); designed to lift completion rates. Badge events reuse the milestone signals already emitted by the checklist/lifecycle.

### 20.12 Cost Estimation Before Activation
*Improves the Cost Estimator (Part 3 §19.6, ADR-020) — surfaced as an explicit pre-activation gate step.*

Before activation, show: **Estimated Monthly AI Cost · Estimated Cost Per Video · Estimated Upload Capacity · Storage Estimate · Expected Rendering Time · Potential Savings · Alternative Providers.** The client can **optimize before activating** (change providers/quality/frequency and see projections update), enforced against plan entitlements (ADR-004). This makes cost a conscious decision at the activation boundary.

### 20.13 First-Week Success Plan
*New post-activation guidance; complements the First-Automation "aha" flow (§13).*

On activation, auto-generate a guided **7-day success plan**: Day 1 Connect APIs → Day 2 Generate Content → Day 3 Publish First Video → Day 4 Analyze Results → Day 5 Optimize → Day 6 Automate → Day 7 Review Growth. Each day links to the exact action + relevant Learning Center lesson; progress is tracked. Drives early retention and customer success.

### 20.14 Workspace Activation Checklist (hard gate)
*Formalizes the activation boundary (ADR-027) — the definitive gate before dashboard access.*

Before the workspace is allowed into full dashboard operation, verify **all**: **Brand Complete · APIs Connected · Subscription Active · Approval Complete · Publishing Ready · Notifications Active · Security Valid · Automation Configured · Readiness Above Minimum Threshold.** Only when all required checks pass does the lifecycle transition `provisioning → active` (Part 3 §1). This is the single authoritative activation gate; the Readiness engine (§12) supplies its inputs.

### 20.15 Deliverable reconciliations (Revision 1)

**Onboarding Journey** (extends §2): add the **Onboarding Dashboard** as the persistent hub across all `provisioning` sub-states; add **Import/Clone** as an alternate entry into Business Profile; add **Certificate issuance** at activation; add **First-Week Success Plan** immediately after activation. The **Activation Checklist** (§20.14) is the explicit `provisioning → active` edge.

**Setup Wizard** (extends §18.2): steps are now **dynamically computed** (§20.2) and rendered in **Beginner/Advanced** density (§20.3); an **Import/Clone** branch can pre-fill the wizard; a **Cost-Estimation** step precedes Submit.

**API Activation** (extends §8, §18.5): connection now **persists into the API Health Center** (§20.5) with continuous re-validation, latency, rotation status, and connection history.

**Validation Matrix** (extends §9) — new validations:

| Validation | Trigger | Sev | Blocks activation? | Behavior / remediation |
|---|---|---|---|---|
| Brand incomplete (below completeness threshold) | brand check (§20.6) | Low | ⛔ (warn) | show missing brand elements + recommendations |
| Import/clone invalid or incompatible | on import (§20.4) | High | ✅ (that import) | preview diff, reject bad entries, guide |
| Activation checklist incomplete | pre-activation (§20.14) | Critical | ✅ | list unmet required checks + jump-to |
| Cost over plan/budget at activation | cost estimate (§20.12) | Medium | ⛔ (warn) | optimize/upgrade suggestion |
| Dynamic-step dependency unmet | wizard rule (§20.2) | Medium | ✅ (that step) | reveal prerequisite step |

**Notification Matrix** (extends §15) — new events:

| Event | Email | In-App | Timing |
|---|---|---|---|
| API health degraded / expiring soon | ✅ | ✅ | on health check |
| Readiness Certificate issued | ✅ | ✅ | at activation |
| Milestone/badge earned | ○ | ✅ | on milestone |
| First-Week Success Plan — daily nudge | ○ | ✅ | daily, days 1–7 |
| Import/clone completed | ○ | ✅ | on import finish |

**Analytics Matrix** (extends §16, §18.9) — new metrics:

| Metric | Source | Purpose |
|---|---|---|
| Beginner vs Advanced mode split | wizard mode events | tune guidance |
| Dynamic-step skip/show rates | wizard rule events | simplify wizard |
| Import/clone adoption | import events | measure migration value |
| API health incidents during onboarding | health events | provider reliability |
| Brand completeness score distribution | brand check | brand-quality baseline |
| Badge/milestone completion | gamification events | motivation effectiveness |
| First-Week plan adherence | success-plan events | early-retention driver |

**Security Matrix** (extends §18.10) — additions:

| Control | Mechanism | When |
|---|---|---|
| Onboarding audit trail | immutable audit stream (§20.10) | every onboarding action |
| Import provenance & isolation | validated deep-copy, no shared refs (§20.4) | on import/clone |
| Activation gate integrity | server-side checklist enforcement (§20.14) | at activation |
| Org-scope authorization (future) | org/dept RBAC (§20.9) | enterprise onboarding |

### 20.16 Missing-feature report (Revision 1)
All 14 items are net-new onboarding capabilities vs the prototype, tracked as **ISS-P4-R1-01…14** (§19.4 update). No existing Part-4 functionality removed.

### 20.17 ADR updates (Revision 1)
- **ADR-025** — The Setup Wizard is **dynamic/rules-driven**: visible steps computed from plan/country/language/content-type/category/providers/platform/mode/expertise; Beginner/Advanced changes density only.
- **ADR-026** — Onboarding is **org-ready**: an optional Organization tier above workspaces (departments, multi-workspace, approval chains, regional inheritance) so enterprise needs no redesign.
- **ADR-027** — A **server-enforced Workspace Activation Checklist** is the single authoritative `provisioning → active` gate.
- **ADR-028** — **Import/Clone** uses validated, previewed **deep-copy** (copy-on-use, ADR-006) preserving tenant isolation and provenance.
- **ADR-029** — Onboarding emits an **immutable audit trail** and a **Readiness Certificate** snapshot at activation.

---

**End of Part 4 — Revision 1 · Status: APPROVED & LOCKED · Version: Revision 1.** Future changes only via an explicit **Revision 2** upgrade. Permanent Source of Truth for Client Onboarding; conflicts resolve to Part 1 → Part 2 → Part 3. Awaiting the next Bible part.
