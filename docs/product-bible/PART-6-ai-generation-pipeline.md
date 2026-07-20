# Part 6 — Complete AI Generation Pipeline Architecture (Revision 1)

**Status: APPROVED & LOCKED**
**Version: Revision 1**
**Date: 2026-07-20**

**Version history:**
| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 (Draft) | 2026-07-20 | Awaiting Review | Initial pipeline: 35-stage lifecycle, per-stage contract, provider matrix, Prompt/Quality/Character/Style/Memory engines, decision engine, cost strategy, human review, observability; 16 deliverables; ADR-040…044; ISS-P6-01…12; epic M12. |
| **Revision 1** | 2026-07-20 | **APPROVED & LOCKED** | +12 enhancements (§16): Multi-Format Content Engine, Content Variation Engine, Knowledge Engine, Brand Voice Engine, SEO Intelligence Engine, Thumbnail Intelligence, Content Compliance Engine, Learning Engine, Multi-Language Engine, Content Calendar Engine, Asset Library, Pipeline Analytics Center. Pipeline/engines/matrices reconciled. ADR-045…049 added; ISS-P6-R1-01…12 added. Future changes only via explicit **Revision 2**. |

**Precedence:** Part 1 (`PRODUCT-VISION.md`) overrides everything · Part 2 (Platform/Super Admin, Rev 1 Locked) overrides implementation · Part 3 (Client Experience, Rev 1 Locked) · Part 4 (Onboarding, Rev 1 Locked) · Part 5 (Automation Engine, Rev 1 Locked). This document is the permanent Source of Truth for the **AI Generation Pipeline** once approved.

**Relationship to prior parts (no duplication):** Part 3 §7 introduced the 20-stage content pipeline (the *client-facing view*); Part 5 defined the **execution runtime** (jobs, workflows, scheduler, recovery, cost governor, provider abstraction, decision engine). **Part 6 is the *content-generation specification*** — the full idea→published-video lifecycle, the per-stage AI contract, and the intelligence engines (Prompt, Quality, Character-Consistency, Visual-Style, Memory) that produce great videos cheaply. It **runs on Part 5's engine** (each stage below is a Part-5 Job) and **realizes Part 3's pipeline** (each stage maps to a Part-3 stage). It does not re-specify the runtime, the queue, or the UI.

**Mapping key:** every stage is a **Part-5 Job** executed inside a **Part-5 Workflow**, gated by the **Part-5 Cost Governor** (ADR-032), routed by the **AI Gateway** (ADR-005), and decided by the **AI Decision Engine** (Part 5 ADR-037, deepened here for content in §9).

---

## 0. Reading guide
Sections 1–13 are the pipeline design. Section 14 holds the **16 required deliverables**. Section 15 is governance (missing-feature report, improvements, ADR + backlog updates). Deliverable tables win over narrative on conflict.

---

## 1. Design principles

Transform a simple content idea into a fully published YouTube video **automatically**, always balancing **Quality · Cost · Speed · Reliability**. Non-negotiables:
- **Format-agnostic** — Long-form · Shorts · Stories · future social platforms, **without architecture redesign** (format is config: aspect, duration, scene budget, pacing).
- **Provider-agnostic** — stages depend on **capabilities**, not brands (Part 5 §13, ADR-003).
- **Cost-capped** — every run honors the per-video cap (Part 1, $1.55) via the engine cost governor.
- **Quality-gated** — outputs are scored; low quality triggers regeneration or manual review (§5).
- **Memory-driven** — each generation learns from the tenant's past (§10).
- **Tenant-isolated** — prompts, memory, assets, artifacts never cross tenants (Part 5 §12).

---

## 2. The complete pipeline (idea → published video)

The full lifecycle, gap-filled. Each node is a **Job** (Part 5 §5); the flow is a versioned **Workflow** (Part 5 §4). Grouped into phases for readability.

```
── STRATEGY ─────────────────────────────────────────────────────────────
Content Strategy ─► Topic Discovery ─► Trend Analysis ─► Keyword Research
   ─► Competitor Analysis ─► Content Validation
── RESEARCH ─────────────────────────────────────────────────────────────
   ─► Research ─► Knowledge Collection ─► Fact Verification
── WRITING ──────────────────────────────────────────────────────────────
   ─► Outline Generation ─► Script Generation ─► Script Review ─► Story Enhancement
── VISUAL PLANNING ──────────────────────────────────────────────────────
   ─► Scene Planning ─► Prompt Engineering ─► Character Planning ─► Environment Planning
── VISUAL GENERATION ────────────────────────────────────────────────────
   ─► Image Generation ─► Image Quality Validation ─► Animation Planning ─► Animation Generation
── AUDIO ────────────────────────────────────────────────────────────────
   ─► Voice Selection ─► Voice Generation ─► Music Selection ─► Music Generation/Selection
── ASSEMBLY ─────────────────────────────────────────────────────────────
   ─► Subtitle Generation ─► Rendering ─► Thumbnail Generation
── PUBLISH PREP ─────────────────────────────────────────────────────────
   ─► SEO Optimization ─► Metadata Generation ─► Final Quality Check
── DISTRIBUTION & LEARNING ──────────────────────────────────────────────
   ─► Publishing ─► Performance Monitoring ─► Continuous AI Learning ──┐
        ▲                                                              │
        └──────────────── feeds Content Memory / next run ◄───────────┘
```

**Auto-added stages (were implicit):**
- **Localization/Translation** (optional) — subtitle/voice variants per language (Part 1: English default, but multi-language ready).
- **Compliance/Safety Check** — content-policy + brand-safety screen (kids/news templates, likeness/consent) before Rendering and again pre-Publish.
- **Cost Estimation gate** — a pre-generation estimate (Part 3 §19.6 / ADR-020) before the first paid stage.
- **Asset Assembly/Reuse resolution** — resolve which assets are reused vs newly generated (cost lever) before Image Generation.
- **Series/Part linking** — link multi-part stories (Part 1 requirement) at Strategy + Metadata.
- **Human Approval gates** — inserted per the per-stage manual/auto matrix (Part 3 §8, Part 5 §15.10).
- **Archival** — store final artifacts + provenance post-publish.

See Deliverable **14.1** (full pipeline diagram).

---

## 3. Every stage — the per-stage AI contract

Each stage defines the full contract requested (**Purpose · Inputs · Outputs · Dependencies · Provider Category · Recommended Models · Est. Cost · Est. Time · Quality Factors · Failure Conditions · Retry · Fallback · Caching · Approval · Manual Behavior · Auto Behavior · Artifacts · Audit · Future**). To keep this authoritative yet readable, the **common contract fields** are stated once, then each stage lists only its **distinctive** values in the table (Deliverable 14.2). Cost/time are *tiers*, not fixed prices (real prices live in the model-routing registry — no hardcoding).

**Common contract (applies to every stage unless overridden):**
- **Dependencies:** the immediately preceding stage's artifacts (plus Memory §10 and Workspace Profile).
- **Retry:** idempotent, exponential backoff, capped (Part 5 ADR-030).
- **Fallback:** next configured provider within budget (Part 5 ADR-033).
- **Caching:** content-hash cache; identical input → cached output, never pay twice (Part 3 cost arch).
- **Manual behavior:** pause → review/edit/regenerate/approve (Part 3 §8).
- **Automatic behavior:** proceed on success + quality-pass; else self-heal → escalate (Part 5 §17.12).
- **Artifacts:** written to the tenant-scoped artifact store with provenance.
- **Audit:** every run logs actor/inputs-hash/provider/model/cost/duration/result.
- **Future:** any capability is swappable via adapter (Part 5 §13).

### 3.1 Stage table (distinctive values)

| # | Stage | Purpose | Provider Category | Cost tier | Quality factors | Key failure → strategy | Approval (default) |
|---|---|---|---|---|---|---|---|
| 1 | Content Strategy | set goals/angle for the video/series | LLM | very-low (bundled) | alignment to profile/goals | vague brief → regenerate w/ more context | auto |
| 2 | Topic Discovery | pick specific topic | LLM + trend data | low | relevance, novelty | no topics → widen niche | auto |
| 3 | Trend Analysis | weight topics by trend | LLM + analytics/trends adapter | low | timeliness | stale data → fallback source | auto |
| 4 | Keyword Research | SEO seed keywords | LLM | very-low (bundled) | search intent match | thin keywords → expand | auto |
| 5 | Competitor Analysis | learn from references | LLM + research adapter | low | insight quality | no refs → skip (optional) | auto |
| 6 | Content Validation | gate: is this worth making? | LLM + rules | very-low | policy/brand fit, dedupe vs Memory | duplicate topic → block/repick | auto (gate) |
| 7 | Research | gather substance | LLM + retrieval | low | depth, sourcing | shallow → deepen/another pass | auto |
| 8 | Knowledge Collection | structure facts | LLM | very-low | coverage | gaps → re-research | auto |
| 9 | Fact Verification | verify claims | LLM + verification/retrieval | low-med | accuracy, citations | unverifiable claim → flag/remove | **manual for factual niches** |
| 10 | Outline Generation | narrative structure | LLM | very-low (bundled) | arc, pacing | weak arc → regenerate | auto |
| 11 | Script Generation | write narration | LLM | low | storytelling, tone, grammar | off-brand → regen w/ style | auto |
| 12 | Script Review | QC the script | LLM (evaluator) + rules | very-low | quality score (§5) | below threshold → regen/manual | auto-gate → manual if low |
| 13 | Story Enhancement | polish/hook/CTA | LLM | very-low | engagement, hook strength | flat → enhance pass | auto |
| 14 | Scene Planning | shot list + importance (HIGH/MED/LOW) | LLM (Scene Decision Engine) | very-low | scene necessity, cost fit | over-budget plan → downgrade tiers | auto |
| 15 | Prompt Engineering | build image/motion prompts | Prompt Engine (§6) | very-low | prompt quality, style binding | weak prompt → optimize (§6) | auto |
| 16 | Character Planning | lock character identity | Character Engine (§7) | very-low | identity/consistency refs | missing ref → use master/generate once | auto |
| 17 | Environment Planning | lock settings/lighting/camera | Visual Style Engine (§8) | very-low | continuity | style clash → apply style pack | auto |
| 18 | Image Generation | keyframes | Image | **HIGH (paid)** | fidelity, prompt adherence, consistency | provider fail → fallback; low qual → regen | **manual before first paid run** (Part 1) |
| 19 | Image Quality Validation | QC images | Vision evaluator + rules | low | visual quality, consistency, artifacts | fail → partial regen (only bad images) | auto-gate → manual if low |
| 20 | Animation Planning | decide motion vs static | LLM + rules | very-low | motion necessity (cost lever) | n/a → default Ken-Burns | auto |
| 21 | Animation Generation | motion clips | Animation / local FFmpeg | **HIGH (paid) only when needed** | smoothness, coherence | paid fail → local motion fallback | auto (paid gated) |
| 22 | Voice Selection | choose narrator voice | config + Memory | none | voice-brand fit | none → default voice | auto |
| 23 | Voice Generation | narration audio | Voice | med (paid) | naturalness, pacing, pronunciation | fail → fallback voice provider | auto |
| 24 | Music Selection | choose track | library | none | mood fit | none → default bed | auto |
| 25 | Music Generation/Selection | produce/pick track | Music / library | low-none | mood, licensing | gen fail → library fallback | auto |
| 26 | Subtitle Generation | captions | local (align to audio) | none | accuracy, timing, language | misalign → re-align | auto |
| 27 | Rendering | compose 9:16/16:9 video | Rendering (local FFmpeg) | low (compute) | sync, resolution, encoding | render fail → retry/checkpoint | auto |
| 28 | Thumbnail Generation | CTR asset | Image / template | low-med | CTR appeal, brand, text | fail → template fallback | auto |
| 29 | SEO Optimization | title/desc/tags | LLM | very-low (bundled) | search fit, CTR | thin → regen | auto |
| 30 | Metadata Generation | full metadata + series links | LLM + rules | very-low | completeness, policy | missing → fill/flag | auto |
| 31 | Final Quality Check | holistic gate | Quality Engine (§5) | low | overall AI Quality Score + Publishing Readiness | below threshold → route back | **auto-gate → manual if below** |
| 32 | Compliance/Safety Check | policy + brand safety | rules + LLM classifier | very-low | policy pass, safety | violation → block + notify | **manual on violation** |
| 33 | Publishing | upload to destination | Publishing adapter | none (quota) | upload success, correctness | fail → retry/backoff; token → reconnect | **manual confirm for first publish** (Part 1) |
| 34 | Performance Monitoring | pull metrics | Analytics adapter | none | data freshness | api fail → retry batched | auto |
| 35 | Continuous AI Learning | update Memory + Insights | LLM (batched) + Memory | low (periodic) | learning value | n/a | auto |

**Note on cost:** the *single-structured-LLM-call* strategy (Part 3 cost arch) means many "very-low (bundled)" LLM stages (1–17, 29–30) are produced together in as few calls as possible; **HIGH** paid pixels (18, 21, 28) are minimized via Scene Planning tiers + asset reuse. See Deliverable **14.9** (Cost Strategy).

---

## 4. AI Provider Abstraction (capability matrix)

Never design around a specific provider — support **capabilities** (Part 5 §13, ADR-003). Every capability is an adapter behind a stable interface, resolved from the routing registry.

| Capability | Used by stages | Example (illustrative, config-driven) | Swappable? |
|---|---|---|---|
| **LLM** | 1–17, 29–32, 35 | OpenAI / Gemini / others | ✅ |
| **Vision (evaluate)** | 19, 31 | vision model for QC | ✅ |
| **Image** | 18, 28 | Flux / others | ✅ |
| **Animation** | 21 | Kling/LTX/Wan / local FFmpeg | ✅ |
| **Voice** | 23 | ElevenLabs / others | ✅ |
| **Music** | 25 | music gen / licensed library | ✅ |
| **Video/Rendering** | 27 | local FFmpeg / cloud render | ✅ |
| **SEO** | 29–30 | LLM-backed | ✅ |
| **Publishing** | 33 | YouTube / future IG/TikTok (ADR-015) | ✅ |
| **Analytics** | 34 | YouTube Analytics / future | ✅ |
| **Retrieval/Trends/Verification** | 3,5,7,9 | search/trend/verification adapters | ✅ |
| **Future categories** | — | new capabilities register + route | ✅ |

**Rule:** a workflow references *"voice"*, never *"ElevenLabs"*; swapping a provider is a registry change with **no pipeline redesign**. See Deliverable **14.3**.

---

## 5. Content Quality Engine

Evaluates **every** output and drives regeneration/gating (realizes Part 3 §19.4 AI Quality Score; uses Part 5 ADR-018 explainable/pluggable evaluators).

**Dimensions:** Research Quality · Script Quality · Storytelling · Grammar · Fact Accuracy · Character Consistency · Scene Consistency · Visual Quality · Animation Quality · Voice Quality · Subtitle Quality · Thumbnail Quality · SEO Quality · Publishing Readiness · **Overall AI Quality Score**.

**How evaluation works:**
- Each dimension = **rules-based checks** (technical validity, completeness, brand/profile conformance) + optional **AI evaluator** (LLM/vision) via the Gateway. Weights are config (Workspace Profile). Scores are **explainable** (factors shown).
- **Regeneration logic:** a failing dimension triggers the **narrowest** regeneration — *partial* (only bad scenes/images) before *full* (whole stage), to save cost (§9). Regeneration count is capped; repeated failure → **Manual Review**.
- **Thresholds affect automation:** per-workspace thresholds decide auto-proceed vs regenerate vs pause. High-stakes dimensions (Fact Accuracy, Compliance) can force manual gates regardless of score. The **Final Quality Check** (stage 31) is the holistic gate before publish.

See Deliverable **14.5**.

---

## 6. Prompt Engine (a core platform asset)

An enterprise prompt system (realizes Part 2 §11.6 Prompt Governance at the pipeline layer). Supports: **Templates · Variables · Reusable Prompts · Versioning · Localization · Dynamic Building · Validation · Optimization · History · Testing · Simulation · Cost Estimation · Approval · Governance · Future Providers · Marketplace (future).**

**Architecture:**
- **Templates + Variables** — prompts are versioned templates with typed variables filled from the Script/Scene/Character/Style/Profile at build time (**Dynamic Prompt Building**).
- **Versioning + History + Governance** — immutable versions, approval workflow, rollback (mirrors Part 5 ADR-036 for prompts; Part 2 §11.6). One **Active** version per template.
- **Localization** — per-language variants (multi-language readiness).
- **Validation + Optimization** — lint prompts (missing vars, unsafe content); optimize for cost/quality (shorter, better-structured) with measurable A/B (Experiment Center, Part 2 §11.8).
- **Testing + Simulation + Cost Estimation** — dry-run a prompt (mock provider, Part 5 §17.10) and estimate token cost **before** paid use (ADR-020).
- **Approval** — governed prompts require approval before Active (Part 2 §11.6).
- **Marketplace (future)** — prompts as installable assets (copy-on-use, ADR-006/028).

The Prompt Engine is **provider-agnostic** — the same template renders for any LLM/image provider via adapter-specific formatting. See Deliverable **14.4**.

---

## 7. Character Consistency Engine

Guarantees identity across an entire video/series (realizes Part 1's uploaded-face requirement). Locks: **Character Identity · Appearance · Clothing · Expressions · Voice · Personality · Environment · Lighting Style · Camera Style · Scene Continuity · Visual Continuity.**

**Architecture:**
- **Character record** in the tenant Character Library (Part 3 §9) holds a **reference set** (the uploaded primary face; the "Meera" secondary) + descriptors + a **voice binding**.
- **Identity preservation** — image generation uses face/appearance references (IP-Adapter/FaceID-style, provider-abstracted) so the same character recurs across scenes/videos.
- **Consistency descriptors** — clothing/expression/personality/lighting/camera are **structured attributes** injected into every scene prompt (via the Prompt Engine §6), ensuring continuity.
- **Master-once economics** — generate a character master **once**, reuse across scenes/videos (cost lever, §9); regenerate only on drift detected by the Quality Engine (Character/Scene Consistency dimensions, §5).
- **Series continuity** — the same character/voice/style carries across Part 1/2/… of a story.

See Deliverable **14.6**.

---

## 8. Visual Style Engine

Reusable, versioned visual styles. Examples: **Realistic · Cinematic · Anime · Pixar-style · Documentary · Historical · Kids · Fantasy · Minimal · Corporate · Medical · future styles.**

**Architecture:**
- A **Style Pack** = versioned bundle of visual descriptors (palette, rendering look, camera/lighting conventions, negative prompts) applied uniformly across a video via the Prompt Engine.
- **Reusable + versioned** (Part 5 ADR-036 model): one Active version; workspaces adopt platform master styles via copy-on-use (ADR-006).
- **Binds to format** — a style renders correctly for Shorts/Long/Stories (format is separate config).
- **Safety-aware** — Kids/Medical styles carry stricter content/safety defaults (ties to Compliance, stage 32).

See Deliverable **14.7**.

---

## 9. AI Decision Engine (content-generation decisions)

Deepens Part 5 ADR-037 for the pipeline. Documents how the pipeline chooses, **explainably and auditably**: **Best Model · Fallback Model · Quality Model · Low-Cost Model · Fast Model · Provider Switching · Regeneration · Partial Regeneration · Complete Regeneration · Caching · Human Approval.**

**Decision inputs:** scene importance tier (HIGH/MED/LOW), active **Execution Policy** (Cost/Speed/Quality/Balanced, Part 5 §17.9, ADR-038), quality scores (§5), budget remaining (governor, ADR-032), provider health (circuit breakers, ADR-033), Memory (§10), and the manual/auto matrix (Part 3 §8).

**Representative logic (explainable, cost-bounded):**
- **Model tier** — HIGH scenes → quality model; LOW scenes → low-cost/local; policy shifts the bias but never exceeds the cap.
- **Regeneration scope** — prefer **partial** (only failing scenes/images) over **complete** to minimize cost; cap attempts; escalate to manual.
- **Caching/reuse** — check cache + Asset Library + Memory before any paid call.
- **Provider switching** — on failure/quota, fall back within budget (ADR-033).
- **Human approval** — required for first paid run, factual/compliance flags, and below-threshold quality (Part 1 + §5).

Every decision records signals, policy, chosen action, rejected alternatives, and cost/quality rationale (Part 5 ADR-037). See Deliverable **14.8**.

---

## 10. Content Memory (tenant-isolated learning)

An AI Memory that makes each generation smarter (feeds Continuous Learning, stage 35; powers Business Insights, Part 3 §19.10). Remembers: **Past Videos · Characters · Brand Voice · Writing Style · Visual Style · Prompt History · Successful Topics · Failed Topics · Audience Preferences · Publishing History · SEO Performance.**

**Architecture:**
- **Tenant-isolated store** (hard invariant, Part 5 §12) — Memory **never** crosses tenants; one workspace's learnings never leak to another.
- **Structured + semantic** — factual records (topics/performance/history) + embeddings for similarity ("have we covered this? what worked?").
- **Write path** — Continuous Learning (stage 35) updates Memory post-publish with outcomes (views/CTR/retention join, Part 3 §12).
- **Read path** — Strategy/Topic/Prompt/Character/Style stages query Memory to avoid duplicates (Content Validation, stage 6), reuse winners, and steer style/voice.
- **Explainable influence** — when Memory changes a decision, the Decision Engine (§9) records it.

See Deliverable **14.10**.

---

## 11. Human Review

Realizes the review capabilities across pipeline gates (extends Part 3 §8 + Part 5 §15.10). Supports: **Stage Approval · Stage Rejection · Inline Editing · Comments · Regeneration · Partial Regeneration · Comparison View · Version History · Rollback · Approval Chains.**

**Behavior:** any stage in **manual** mode pauses to a review surface showing the stage's inputs/outputs/artifacts/cost; the reviewer can approve, reject (with reason → regeneration), edit inline (e.g., tweak the script), regenerate (partial/complete), compare versions, and roll back. **Approval chains** (multi-reviewer) generalize for teams/enterprise (Part 4 ADR-026). All actions audited. See Deliverable **14.11**.

---

## 12. Observability

Complete pipeline visibility (feeds Part 3 §19.1 Live Timeline, Part 5 §17.3 Execution Visualizer, Part 2 §11.4 AI Observability). Exposes per run/stage: **Timeline · Current Stage · Progress · Provider · Model · Tokens · Cost · Duration · Outputs · Artifacts · Warnings · Errors · Retries · Logs · Recommendations.** Correlation/run/tenant IDs on every record (Part 5 §11). See Deliverable **14.12**.

---

## 13. Scalability & quality/cost improvements (auto-added)

Found while reviewing:
- **Single-call bundling** of non-pixel LLM stages → fewer calls, lower cost, faster.
- **Scene-tier routing** (HIGH/MED/LOW) as the primary cost lever → paid pixels only where they matter.
- **Partial regeneration first** → cheapest path to quality.
- **Master-once characters/styles + asset reuse + content-hash cache** → never pay twice.
- **Compliance/safety as explicit stages** (pre-render + pre-publish) → policy risk contained.
- **Format as config** → Shorts/Long/Stories/future platforms share one pipeline.
- **Memory-driven dedupe + winner-reuse** → higher quality per dollar over time.
- **Pluggable evaluators + provider adapters** → quality and cost improve as the market does, no redesign.

---

## 14. Required Deliverables

### 14.1 Complete AI Pipeline Diagram
The §2 idea→published flow (35 stages across Strategy/Research/Writing/Visual-Planning/Visual-Gen/Audio/Assembly/Publish-Prep/Distribution) with the Learning→Memory loop and inserted Compliance + Cost-Estimate + Approval gates.

### 14.2 Stage Architecture
The §3 per-stage contract: common contract (stated once) + the §3.1 distinctive-values table for all 35 stages. Each stage = a Part-5 Job.

### 14.3 AI Provider Capability Matrix
See §4 (capability × stages × swappable). Workflows reference capabilities, not brands.

### 14.4 Prompt Engine Architecture
See §6 (templates/variables/versioning/governance/localization/optimization/testing/simulation/cost-estimation/approval/marketplace-future); provider-agnostic rendering.

### 14.5 Quality Engine Architecture
See §5 (dimensions, rules+AI evaluators, explainable weighted scores, partial-before-full regeneration, thresholds gate automation).

### 14.6 Character Consistency Architecture
See §7 (character record + reference set + descriptors + voice binding; identity preservation; master-once; series continuity).

### 14.7 Visual Style Architecture
See §8 (versioned reusable Style Packs; copy-on-use adoption; format-independent; safety-aware).

### 14.8 AI Decision Engine
See §9 (inputs, model-tiering, regeneration scope, caching, provider-switch, approval; explainable + cost-bounded).

### 14.9 Cost Optimization Strategy
Per-stage cost control: **Prompt Optimization · Caching · Reuse · Asset Reuse · Duplicate Detection · Model Selection · Batch Generation · Parallel Optimization · Budget Control · Workspace/Daily/Monthly Limits · Provider Comparison · Cost Prediction · Cost Analytics · Savings Suggestions.** Enforcement via the engine cost governor (Part 5 §10, ADR-032); order: estimate → budget/entitlement check → cache/reuse/dedupe → cheapest-sufficient model (scene tier) → batch/parallel within cost limits → meter → reconcile (ADR-020). Over-budget → block/downgrade. **Never wastes AI cost.**

### 14.10 Content Memory Architecture
See §10 (tenant-isolated structured+semantic memory; write on learning, read on planning; explainable influence).

### 14.11 Human Review Architecture
See §11 (approve/reject/inline-edit/comment/regenerate/partial/compare/version/rollback/approval-chains; audited).

### 14.12 Observability Matrix
| Signal | Source | Consumer |
|---|---|---|
| Timeline/Stage/Progress | run+stage state (Part 5) | Live Timeline (P3 §19.1) |
| Provider/Model/Tokens | AI Gateway | AI Observability (P2 §11.4) |
| Cost (running/final) | Gateway accounting | Cost Breakdown (P3 §19.2), governor |
| Duration/Retries | job metrics | reliability |
| Outputs/Artifacts | tenant artifact store | Human Review (§11), publish |
| Warnings/Errors/Logs | structured stage logs | debugging, RCA (P5 §9) |
| Quality scores | Quality Engine (§5) | gating, Quality report (P3 §19.4) |
| Recommendations | Decision Engine + Insights | optimization (P3 §19.10) |

### 14.13 Missing Feature Report → §15.1
### 14.14 Architecture Improvement Suggestions → §15.2
### 14.15 ADR Updates → §15.3
### 14.16 Migration Backlog Updates → §15.4

---

## 15. Governance

### 15.1 Missing Feature Report (found while designing Part 6)
1. **Full idea→publish content pipeline** — the prototype has a partial 20-stage concept; Strategy/Trend/Competitor/Fact-Verification/Story-Enhancement/Compliance/Learning stages are missing or mocked (ISS-P6-01).
2. **Content Quality Engine** — dimensioned, explainable scoring with partial-regeneration + threshold gating (realizes P3 §19.4 at pipeline layer) (ISS-P6-02).
3. **Enterprise Prompt Engine** — templates/variables/versioning/governance/localization/optimization/testing/simulation/cost-estimation (ISS-P6-03).
4. **Character Consistency Engine** — reference-set identity preservation + descriptors + master-once + series continuity (ISS-P6-04).
5. **Visual Style Engine** — versioned reusable Style Packs (ISS-P6-05).
6. **Content-generation Decision Engine** — model-tiering + regeneration-scope + provider-switch + approval, explainable (extends P5 ADR-037) (ISS-P6-06).
7. **Content Memory** — tenant-isolated structured+semantic learning store (ISS-P6-07).
8. **Fact Verification + Compliance/Safety stages** — accuracy + policy/brand-safety gating (ISS-P6-08).
9. **Format-agnostic pipeline config** — one pipeline for Shorts/Long/Stories/future platforms (ISS-P6-09).
10. **Pipeline-level cost optimization** — batch generation, duplicate detection, provider comparison, savings suggestions beyond current caching (ISS-P6-10).
11. **Human Review for generation** — inline edit/partial-regenerate/compare/approval-chains at pipeline gates (extends P3 review) (ISS-P6-11).
12. **Localization/multi-language generation** — voice+subtitle variants (ISS-P6-12).

**Already tracked (referenced):** engine runtime/jobs/queue/recovery (M11, ISS-P5-*), AI Gateway (ISS-P2-06), model routing DB-driven (ISS-E2), Prompt Governance console (ISS-P2-R1-06/§11.6), Global Asset Library (ISS-P2-R1-07), Quality/Cost/Timeline surfaces (ISS-P3-R1-01/02/04), pipeline↔engine wiring (ISS-A2/M4), per-tenant creds/Vault (ISS-B2/M3), real AI planner (ISS-B3/M6), analytics ingestion (ISS-P3-05).

### 15.2 Architecture Improvement Suggestions
1. **Bundle non-pixel LLM stages into as few structured calls as possible** — biggest cost + latency win; keep pixels (image/animation/thumbnail) as the only routinely-paid stages.
2. **Make Scene Planning the cost brain** — HIGH/MED/LOW tiers + new-asset-required flags decide every paid call; wire it to the Decision Engine and governor.
3. **Prompt Engine + Style Packs + Character records as first-class versioned assets** — reuse and governance turn generation quality into a compounding asset (and enable a marketplace).
4. **Partial-regeneration-first everywhere** — regenerate the failing scene/image, not the whole stage.
5. **Compliance/safety as explicit gates** (pre-render + pre-publish) — contain policy/brand/legal risk, especially Kids/News/likeness.
6. **Tenant-isolated Content Memory from day one** — dedupe topics, reuse winners, steer style; compounding quality-per-dollar.
7. **Everything provider- and format-agnostic** — capabilities + config, so new models/platforms/formats drop in without redesign.

### 15.3 ADR updates (added to `product-bible/ADR.md`)
- **ADR-040** — The content pipeline is **format-agnostic**: Shorts/Long/Stories/future platforms are config (aspect/duration/scene-budget/pacing), one pipeline, no redesign.
- **ADR-041** — **Prompts, Visual Styles, and Characters are first-class versioned, reusable, governed assets** (immutable versions, one Active, copy-on-use adoption), rendered provider-agnostically.
- **ADR-042** — **Quality-gated generation with partial-regeneration-first**: dimensioned explainable scores gate automation; regenerate the narrowest failing unit before escalating.
- **ADR-043** — **Tenant-isolated Content Memory** drives generation (dedupe/reuse/steer); never crosses tenants; its influence on decisions is auditable.
- **ADR-044** — **Compliance/Safety are explicit pipeline gates** (pre-render + pre-publish); violations block and notify; stricter defaults for Kids/News/likeness.

### 15.4 Migration Backlog updates
Items **ISS-P6-01 … ISS-P6-12** added under new epic **M12 (AI Generation Pipeline — content intelligence)**, running on M11 (engine) and cross-linking M4 (pipeline wiring), M6 (real AI planner), M3 (per-tenant creds), M8 (Prompt Governance/Asset Library consoles). See `MIGRATION-BACKLOG.md`.

---

---

## 16. Revision 1 — Content Intelligence Enhancements

Revision 1 **adds** the following without removing anything above. Overlaps **improve** existing sections (mappings noted); nothing is duplicated. Theme: turn the pipeline from *generate one video* into a *multi-format, multi-language, knowledge-grounded, self-learning content factory* — all provider- and format-agnostic.

### 16.1 Multi-Format Content Engine
*Improves format-agnostic principle (§1, ADR-040) — makes multi-platform output first-class.*

The pipeline future-proofs for: **YouTube Long · YouTube Shorts · Instagram Reels · Facebook Reels · TikTok · LinkedIn Video · X Video · Pinterest Idea Pins · Podcasts · future platforms.** Architecture: a **Format Profile** (config) declares aspect, duration, scene budget, pacing, caption style, audio requirements, and the **Publishing destination adapter** (ADR-015). One source generation can **repurpose** into multiple format outputs (e.g., a long video → a Short + a Reel) via a **format-adaptation step** that re-crops/re-times/re-captions without re-generating pixels where possible (cost lever). **No pipeline redesign** — new platforms are a Format Profile + a Publishing adapter (ADR-045). Podcasts degrade gracefully to an audio-first profile (voice + optional static/waveform visual).

### 16.2 Content Variation Engine
*New capability layered on the generation stages; feeds A/B testing (Part 2 §11.8 Experiment Center).*

Generate multiple variations from one idea: **Multiple Hooks · Titles · Thumbnails · CTAs · Scripts · Voice Styles · Scene Variations · Endings.** Variations are **cheap where possible** (text/metadata variants are near-free LLM output; thumbnail/voice variants are cost-gated) and are produced as **linked artifacts** of one content item. Supports **A/B testing** — publish/test variants, measure via the Learning Engine (§16.8), and let the Decision Engine (§9) promote winners (which feed Content Memory §10). Variation breadth respects the cost governor (ADR-032) and Execution Policy (Part 5 §17.9).

### 16.3 Knowledge Engine (RAG + grounding)
*Improves Research / Knowledge Collection / Fact Verification (stages 7–9) with an enterprise retrieval layer.*

An enterprise knowledge system: **Trusted Sources · Internal Knowledge Base · Client Documents · Uploaded PDFs · Website Crawling · RAG · Citation Tracking · Fact Confidence Score · Hallucination Detection · Source Freshness.** Architecture: a **tenant-isolated knowledge index** (embeddings + metadata) that the Research/Fact-Verification stages query (RAG) to ground scripts in verifiable sources; every claim carries **citations + a confidence score**; low-confidence or uncited claims trigger the Compliance/Quality gates (**hallucination detection**); **source freshness** decays stale knowledge. Tenant isolation is absolute (Part 5 §12) — one client's documents never inform another's content (ADR-046). Powers factual niches (stage 9 manual gate).

### 16.4 Brand Voice Engine
*Improves Script/Story stages (11–13) and the Prompt Engine (§6) — formalizes brand-voice consistency.*

Guarantees consistent: **Tone · Vocabulary · Writing Style · Storytelling Style · CTA Style · Emotional Style · Brand Personality.** Architecture: a versioned **Brand Voice Profile** (part of the Workspace Profile / Brand Kit, Part 3–4) expressed as structured descriptors + exemplars, injected into every writing prompt (via §6) and scored by the Quality Engine's Storytelling/Grammar/Tone dimensions (§5). **Multiple brand profiles** supported (a workspace or org, ADR-026, can hold several brands/channels), each versioned and reusable (ADR-041 asset model). Reconciles with Character voice binding (§7).

### 16.5 SEO Intelligence Engine
*Improves Keyword Research / SEO / Metadata stages (4, 29, 30) — a dedicated AI SEO system.*

Supports: **Keyword Research · Search Intent · Competitor Gap Analysis · Trending Keywords · Metadata · Hashtags · Tags · Chapters · Description · End Screens · Cards · Playlist Suggestions.** Architecture: SEO becomes a **capability** (LLM + trends/competitor adapters, §4) producing a structured SEO package per format (YouTube tags/chapters/cards differ from Reels hashtags — driven by the Format Profile §16.1). Competitor-gap + trending inputs come from research adapters; outputs feed Metadata (stage 30) and the Learning Engine (§16.8) closes the loop on SEO ranking performance.

### 16.6 Thumbnail Intelligence
*Improves Thumbnail Generation (stage 28) and the Quality Engine thumbnail dimension (§5).*

Supports: **Thumbnail Scoring · CTR Prediction · Multiple Variations · Face Detection · Text Optimization · Heatmap Prediction · Brand Consistency.** Architecture: thumbnails are generated as **multiple variations** (§16.2), each **scored** (CTR-prediction model + rules) with **face-detection** and **text-legibility/heatmap** heuristics, checked against the Brand Kit for **consistency**; the Decision Engine (§9) picks the top variant (or defers to A/B test §16.2). Pluggable scoring evaluators (ADR-018). Feeds Thumbnail Performance analytics (Part 3 §12).

### 16.7 Content Compliance Engine
*Deepens the Compliance/Safety gates (stage 32, ADR-044) into a full detection system.*

Automatically detects: **Copyright Risk · Unsafe Content · Platform Policy Violations · Sensitive Topics · AI-Generated Disclosure (future) · Brand Violations.** Every warning is **explainable** (what triggered it, where, severity, remediation). Runs at the pre-render and pre-publish gates (ADR-044); severity-tiered (block vs warn, like Part 4 §9); platform-specific policy packs align with the Format Profile (§16.1) so a Short and a Reel are checked against their own platform's rules. **AI-generated disclosure** is a forward-looking toggle for jurisdictions/platforms that require it.

### 16.8 Learning Engine
*Deepens Continuous AI Learning (stage 35) + Content Memory (§10) into a structured performance-learning loop.*

Learns from: **Views · Watch Time · CTR · Likes · Comments · Audience Retention · Subscribers · Geography · Publishing Time · SEO Ranking.** Architecture: post-publish, the Learning Engine ingests these signals (Analytics adapter, stage 34), attributes them to content/variation/thumbnail/voice/topic/time features, and updates **Content Memory** (§10) + **Business Insights** (Part 3 §19.10) with what worked. Future generations read these learnings (Strategy/Topic/Thumbnail/SEO/Calendar stages) to improve. Tenant-isolated (ADR-043); learning influence on decisions is auditable (ADR-037).

### 16.9 Multi-Language Engine
*Improves the Localization stage (§2 auto-added) — a full localization capability.*

Supports: **Original Language · Translation · Localized Scripts · Localized Voice · Localized Thumbnail · Localized SEO · Regional References** — **without rebuilding the pipeline** (ADR-047). Architecture: language is a **Format/Locale dimension**; a generated master can fan out into localized variants (translated + culturally-adapted script → localized voice → localized subtitles/thumbnail/SEO). Regional references are handled by the Knowledge Engine (§16.3) + Brand Voice (§16.4). English remains the default (Part 1); the architecture is multi-language-ready from day one (closes ISS-P6-12).

### 16.10 Content Calendar Engine
*Improves Content Strategy/Topic stages (1–2) and integrates the Part 3 §6 planner into generation.*

The pipeline understands: **Publishing Calendar · Holidays · Events · Series · Campaigns · Weekly Themes · Seasonal Topics.** Architecture: the planner's calendar (Part 3 §6) becomes a **generation input** — Strategy/Topic Discovery align each video to the calendar slot (a seasonal/holiday/campaign context, a series part, a weekly theme). Calendar context flows into prompts (§6) and SEO (§16.5). Series continuity reuses Character/Style (§7/§8). This makes generation **calendar-aware**, not just on-demand (ADR-048).

### 16.11 Asset Library
*Formalizes and unifies the reusable-asset stores referenced across Parts 3/5/6 (Character/Style/Prompt/Music…).*

One reusable, versioned library for: **Characters · Backgrounds · Music · Logos · Intros · Outros · Transitions · Voice Profiles · Prompts · Style Packs.** Architecture: all are **first-class versioned assets** (ADR-041) in the tenant Asset Library (Part 3 §9), adoptable from platform masters via **copy-on-use** (ADR-006), reused across videos/series to cut cost (master-once, §7/§9) and ensure consistency. This is the workspace-side counterpart of the platform **Global Asset Library** (Part 2 §11.7). Everything reusable and versioned (ADR-049).

### 16.12 Pipeline Analytics Center
*Improves Observability (§12) — per-stage operational analytics.*

Exposes analytics for **every pipeline stage**: **Success Rate · Failure Rate · Average Cost · Average Time · AI Quality · Regeneration Count · Human Review Count · Provider Usage · Optimization Suggestions.** Architecture: rollup-backed (ADR-007) from the observability signals (§12) + Quality Engine (§5) + Decision Engine (§9); tenant-scoped for the workspace and aggregated for Super-Admin (Part 2 §11.4 AI Observability, Part 5 §17.11 Automation Health). Optimization suggestions feed cost/quality improvement (Part 3 §19.10).

### 16.13 Deliverable reconciliations (Revision 1)

- **AI Pipeline (§2, §3)** — gains a **format-adaptation/repurpose step** (§16.1) and **localization fan-out** (§16.9); Research/Fact stages now **RAG-grounded** by the Knowledge Engine (§16.3); Strategy/Topic stages are **calendar-aware** (§16.10).
- **Prompt Engine (§6)** — consumes **Brand Voice Profiles** (§16.4), **calendar context** (§16.10), and **locale** (§16.9); prompts remain versioned assets (Asset Library §16.11).
- **Quality Engine (§5)** — gains **hallucination detection + fact-confidence** (§16.3), **thumbnail CTR/heatmap scoring** (§16.6), and **compliance detection** (§16.7) as scored/gated inputs.
- **Character (§7) / Visual Style (§8)** — unified under the **Asset Library** (§16.11) with copy-on-use + versioning.
- **Decision Engine (§9)** — now also chooses **variation winners** (§16.2/§16.6) and **format/locale targets** (§16.1/§16.9), all explainable.
- **Memory (§10)** — fed by the **Learning Engine** (§16.8); grounded by the **Knowledge Engine** (§16.3); both strictly tenant-isolated.
- **Cost Optimization (§14.9)** — gains **repurpose-instead-of-regenerate** (§16.1) and **cheap-text-variations** (§16.2) as levers; variation breadth is governor-bounded.
- **Human Review (§11)** — gains **variation comparison** (§16.2) and **compliance-warning review** (§16.7).
- **Observability (§12)** — extended by the **Pipeline Analytics Center** (§16.12).

### 16.14 Missing-feature report (Revision 1)
All 12 items are net-new content-intelligence capabilities vs the prototype, tracked as **ISS-P6-R1-01…12** (§15.4 update). No existing Part-6 functionality removed.

### 16.15 ADR updates (Revision 1)
- **ADR-045** — **Multi-format via Format Profiles + repurposing**: one generation adapts/repurposes into many platform outputs (aspect/duration/caption/destination) with no pipeline redesign; reuse pixels where possible.
- **ADR-046** — **Tenant-isolated Knowledge Engine (RAG)**: grounded generation with citations, fact-confidence, hallucination detection, and source freshness; a tenant's knowledge never informs another's content.
- **ADR-047** — **Multi-language as a locale dimension**: master → localized variants (script/voice/subtitle/thumbnail/SEO/regional) without rebuilding the pipeline; English default.
- **ADR-048** — **Calendar-aware generation**: the publishing calendar (holidays/events/series/campaigns/themes/seasons) is a first-class generation input.
- **ADR-049** — **Unified versioned Asset Library**: characters/backgrounds/music/logos/intros/outros/transitions/voice-profiles/prompts/style-packs are reusable versioned assets (copy-on-use), the workspace counterpart of the platform Global Asset Library.

---

**End of Part 6 — Revision 1 · Status: APPROVED & LOCKED · Version: Revision 1.** Future changes only via an explicit **Revision 2** upgrade. Permanent Source of Truth for the AI Generation Pipeline; conflicts resolve to Part 1 → Part 2 → Part 3 → Part 4 → Part 5. Awaiting the next Bible part.
