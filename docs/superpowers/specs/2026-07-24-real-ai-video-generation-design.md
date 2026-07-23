# Real AI Video Generation — Design Spec

**Date:** 2026-07-24
**Status:** Approved design, ready for phased implementation
**Owner:** Kunal Mishra (platform owner)

## 1. Goal

Turn the pipeline from producing **placeholder** videos (amber-gradient text cards
+ silent audio) into producing **real, engaging, YouTube-ready short videos** with
AI-generated visuals, real voice narration, and the craft elements that actually
drive watch-time and reach — while **never exceeding US$2 per video**.

Success = a client onboards with their own API keys, requests a video, and gets a
polished 9:16 vertical MP4 (real AI visuals + voice + captions + thumbnail) that
can earn a genuinely positive audience response, produced for ≤ $2.

## 2. Current State (verified in code, 2026-07-24)

- **Script/story text** (OpenAI/Gemini): real. ✅
- **SEO metadata** (Gemini): real. ✅
- **Render assembly** (FFmpeg → 1080×1920 H.264/AAC): real. ✅
- **Publish + analytics**: real. ✅
- **AI visuals** (`pipeline/fal_adapter.py`): **STUB** — `generate_image` /
  `generate_motion` raise `NotImplementedError` for `dry=False`. ❌
- **Voice** (`ai/tts/elevenlabs_adapter.py`): implemented (`eleven_multilingual_v2`,
  single `elevenlabs_voice_id`) but only runs in `live` mode, which currently
  crashes at the visual stub before voice ever executes. 🟡
- **Live-vs-mock gate** (`render_worker._apply_tenant_env`): `live = fal AND
  elevenlabs present`. So a client with both keys triggers `live` → crash today.
- **Already present and reusable:** decision engine (`pipeline/decision.py`),
  `CostGovernor` (per-video budget, downgrade logic), `characters` /
  `character_versions` / `asset_library` tables, per-tenant Vault keys, M15
  review/approval, durable render worker.

## 3. Requirements (decisions made during brainstorming)

1. **Visuals:** real AI **video clips** (image-to-video), not just stills.
2. **Character consistency:** **flexible** — both recurring channel characters
   (a saved library) and per-video one-off characters.
3. **Voice:** **flexible** — client chooses single-narrator OR per-character voices.
4. **Hard cost cap:** **≤ $2 per video**, enforced in code. Lower is fine.
5. **Per-tenant keys:** every provider key comes from that client's Vault, per job.
   No client key in platform env. (Already true.)
6. **Different concept every video** (driven by script).
7. **Optimised for positive audience response**, i.e. the 8 quality/business items
   in §6, not just "a video that plays".

## 4. Architecture

The pipeline keeps its existing shape; we implement the stubbed generators and add
the quality/business layers. Each stage is an isolated unit with a clear interface.

```
Client topic/idea
  │
  1. SCRIPT + HOOK  (OpenAI/Gemini)  — scenes, narration, per-speaker lines,
  │                                    retention-first hook, character descriptions
  2. CHARACTER refs (fal Flux)       — one reference image per character;
  │                                    recurring chars pulled from the library
  3. per SCENE:
  │     a. KEYFRAME image (fal Flux)  — uses the character reference for consistency
  │     b. IMAGE→VIDEO clip (fal i2v) — Kling/Hailuo/LTX tier chosen by budget
  │        └─ CostGovernor gate: if this clip would break the $2 budget,
  │           downgrade the scene to image + Ken-Burns motion (already supported)
  4. VOICE (ElevenLabs)              — single narrator OR per-character voices
  5. CAPTIONS + MUSIC                — styled word-highlight captions; royalty-free music
  6. ASSEMBLE (FFmpeg)               — 1080×1920 MP4
  7. THUMBNAIL + SEO                 — high-CTR thumbnail, title/description/tags
  8. REVIEW → APPROVE → PUBLISH → ANALYTICS
```

**Key design choice — keyframe-first for consistency:** we never go text→video
directly. We generate a character-consistent still, then animate it. Because i2v
starts from that still, the character/look stays stable within the clip, and across
clips when they share a character reference.

**Provider isolation:** `fal_adapter` stays the only module that calls fal.ai;
`elevenlabs_adapter` the only one that calls ElevenLabs. Model choice always comes
from routing config so providers can be swapped without a pipeline rewrite.

## 5. Cost model & the $2 guarantee

Representative 60s / 8-scene video (mid-tier i2v):

| Item | Est. cost |
|---|---|
| Script + SEO (OpenAI/Gemini) | ~$0.03 |
| 8 keyframe images (Flux) | ~$0.24 |
| 8 i2v clips (Kling 1.6 std ~$0.10) | ~$0.80 |
| Voice (ElevenLabs) | ~$0.09 |
| Thumbnail | ~$0.03 |
| **Total** | **~$1.20** |

Premium i2v tiers push toward ~$1.80 — still under cap. Enforcement:

- `CostGovernor(budget=2.00)` (configurable, and settable lower per tenant).
- Before each paid call the governor checks remaining budget; a scene that would
  exceed it is **downgraded** to image + Ken-Burns (real clip, ~$0.03).
- **Hard invariant: total spend per video never exceeds the budget.**
- **Retry-cost safety:** already-generated assets are cached/adopted (assets rows +
  prompt cache), so a mid-render failure never re-pays for finished clips.
- Every paid call is logged to `api_usage` for per-tenant cost visibility.

## 6. The 8 quality & business requirements (folded into phases)

1. **Hook + script quality** — first ~3s hook, retention-first structure. Elevated
   to a P1 core concern (dedicated prompt work + structure), not "assumed done".
2. **Styled captions** — word-by-word highlighted captions (most shorts are watched
   muted). P1 core, not polish.
3. **Thumbnail + title CTR** — purpose-built high-CTR thumbnail + title. P2.
4. **Background music** — engagement lift, sourced from a **royalty-free** library
   only (no copyright strikes). P3.
5. **YouTube reused/AI-content policy** — enforce per-video variety and real
   transformation to reduce demonetization risk; design-level concern in every phase.
6. **AI-content disclosure** — set the "altered/synthetic content" flag on upload
   where YouTube requires it. Cross-cutting.
7. **YouTube upload quota** — Data API default ≈ 6 uploads/day/project (1600 units
   each). Track quota, queue/spread uploads, document how to request more. Cross-cutting.
8. **Retry cost safety** — never re-pay for assets already produced (see §5).

## 7. Phased plan

Each phase is independently testable and delivers standalone value. P1+P2 already
make a genuinely good, voiced, captioned AI video.

- **P1 — Real visuals + hook/script + captions (core quality)**
  - Implement `fal_adapter.generate_image` (Flux) — real keyframes, download to storage.
  - Implement `fal_adapter.generate_motion` (i2v) — real clips, budget-tiered.
  - Retention-first hook/script prompt work.
  - Styled word-highlight captions in the render.
  - `CostGovernor` $2 enforcement + retry-cost safety, verified.
  - Live end-to-end test with real keys → real voiced-less visual video first,
    then P2 adds voice.
- **P2 — Voice + thumbnail**
  - Make the live pipeline resilient so voice runs; wire ElevenLabs live path.
  - Per-tenant narrator voice selection (voice_id stored per tenant).
  - High-CTR thumbnail generation (fal image from a thumbnail prompt).
- **P3 — Character library + music**
  - Client can create/save recurring characters (reference image) and reuse across
    videos, or use per-video one-off characters.
  - Royalty-free background music, ducked under narration.
- **P4 — Per-character voices**
  - Assign a voice per character; split narration by speaker; multi-voice synthesis.
- **P5 — Polish + analytics feedback**
  - Transitions, pacing, quality tuning; use analytics to inform future scripts.

**Cross-cutting in every phase:** items 5, 6, 7 above; per-tenant Vault keys; cost logging.

## 8. Testing

- Unit: adapter functions with mocked provider clients (no paid calls in CI).
- Budget: property test that total spend ≤ budget for any scene mix (governor).
- Integration: a `live` end-to-end run behind an explicit opt-in flag + real keys,
  self-skipping without keys/FFmpeg (mirrors existing `tests/acceptance/`).
- Cost assertion: a live run logs real per-item cost and asserts total ≤ $2.

## 9. Out of scope (for now)

- Long-form 16:9 videos (pipeline is 9:16 short-form).
- Fully automated publishing without human review (M15 approval stays).
- Analytics-driven auto-optimisation beyond surfacing data (P5 is manual-informed).
- Non-YouTube platforms.
