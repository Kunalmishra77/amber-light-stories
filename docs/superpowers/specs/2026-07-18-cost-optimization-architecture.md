# Cost-Optimization Architecture — AI Media Generation Pipeline

**Date:** 2026-07-18
**Status:** Authoritative for Phase-1 pipeline implementation
**Principle:** AI generation is the most expensive operation. Every fal.ai call must be justified. Target: **reduce fal.ai usage 50–70% vs a naive implementation** with near-identical perceived quality, under the **$1.55/video hard cap**.

## 1. The one question before any fal.ai call

Before generating anything, the pipeline MUST check, in order:
1. **Does the asset already exist?** → Asset Library search (by tags + character_id + scene role).
2. **Was this exact prompt generated before?** → Prompt Cache (hash lookup).
3. **Can it be edited instead of regenerated?** → reuse a base asset + local edit.
4. **Can FFmpeg achieve it?** → all motion/compositing is local, never fal.
5. **Can OpenAI supply structured data to avoid another AI call?** → batch into one JSON.

If any answer is YES → **do not call fal.ai.**

## 2. Division of labor (hard boundary)

**OpenAI — ONE structured call per story.** Research + logline + script + scene breakdown + per-scene prompts + animation instructions + camera instructions + thumbnail prompt + SEO title/description/tags → returned as a **single JSON document**. Never make separate calls for related tasks.

**Gemini** — research grounding, reference-video style analysis (vision), cheap high-volume text.

**ElevenLabs** — narration only.

**fal.ai — ONLY for genuinely new pixels:**
- ✅ new hero images, new characters, new environments, new cinematic shots, required AI video animation.
- ❌ NEVER for: zoom, pan, camera movement, blur, fade, color grading, crop, rotation, subtitle rendering, text overlays, video merging, frame interpolation. **All of these are local FFmpeg.**

## 3. Scene classification → generation policy

OpenAI tags every scene with an **importance tier**; the backend (not the prompt) decides the generation path:

| Tier | Scene types | Image policy | Motion policy |
|---|---|---|---|
| **HIGH** | hero shot, character intro, cinematic reveal, thumbnail | Premium generation (fal) | AI animation allowed if it adds story value |
| **MEDIUM** | important object / environment | Mid-tier generation, prefer reuse | Ken-Burns / zoom / pan (local) |
| **LOW** | background, sky, texture, map, decorative | **Reuse from Asset Library**; generate only if nothing suitable | Static or local motion only |

Only HIGH-priority scenes may consume premium generation. LOW scenes reuse by default.

## 4. Scene Decision Engine (the routing contract)

For each scene, OpenAI's JSON emits structured metadata; the backend routes on it:

```json
{
  "seq": 3,
  "importance": "HIGH|MEDIUM|LOW",
  "importance_score": 0.0-1.0,
  "new_asset_required": true|false,
  "existing_asset_allowed": true|false,
  "animation_required": true|false,
  "recommended_quality": "Low|Medium|High",
  "motion_type": "static|ken_burns|zoom|pan|motion_crop|ai_animation",
  "asset_query": "keywords to search the Asset Library",
  "prompt": { "...cinematic direction..." }
}
```

Backend logic (pseudocode):
```
for scene in scenes:
    if existing_asset_allowed:
        hit = asset_library.search(scene.asset_query, character_id, threshold=0.82)
        if hit: scene.keyframe = hit; continue           # 0 cost
    cache = prompt_cache.get(hash(scene.prompt))
    if cache: scene.keyframe = cache.asset; continue      # 0 cost
    if new_asset_required:
        model = MODEL_ROUTING[scene.recommended_quality]  # config, not code
        scene.keyframe = fal.generate(model, scene.prompt)
        prompt_cache.put(hash(scene.prompt), scene.keyframe)
    # motion:
    if scene.motion_type == "ai_animation" and animation_required and importance == HIGH:
        scene.motion = fal.i2v(MODEL_ROUTING["motion"], scene.keyframe)
    else:
        scene.motion = ffmpeg_motion(scene.keyframe, scene.motion_type)  # local, free
```
The budget governor caps total fal spend at `projects.per_video_budget_usd` (1.55); if the next fal call would exceed it, downgrade `ai_animation → ken_burns` and premium→mid model.

## 5. Model routing (configurable, not hardcoded)

Stored in `settings` (kind='model_routing') as JSON, editable from the dashboard — changing models is a config edit, never a code change:
```json
{
  "image": { "High": "fal-ai/flux/dev", "Medium": "fal-ai/flux/schnell", "Low": "fal-ai/flux/schnell" },
  "motion": { "premium": "fal-ai/kling-video/v2/master/image-to-video",
               "standard": "fal-ai/kling-video/v1.6/standard/image-to-video",
               "cheap": "fal-ai/ltx-video-13b-distilled/image-to-video" },
  "thumbnail": "fal-ai/flux/dev"
}
```
Default motion tier = **standard/cheap** (Kling-Master reserved for rare hero beats), because the benchmark showed Kling-Master ≈ $1.35/clip — too costly for routine use.

## 6. Asset Library + reuse (permanent)

`assets` table stores every generated character/background/object/environment/effect/logo with tags + metadata + optional perceptual hash. Reuse rules:
- **Characters:** master generated once (reference image + prompt + seed + character_id); reused across every scene and every future video. Never regenerate a known character.
- **Backgrounds/objects/environments:** searched before generation; reused if a match scores above threshold.
- Reuse search = tag/keyword match + character_id + (later) embedding/pHash similarity.

## 7. Prompt Cache (never pay twice)

`prompt_cache` maps `sha256(normalized_prompt + model + params)` → `asset_id`. Every fal call: hash first, look up, return the stored asset on hit. Populated on every miss. Identical prompts never bill twice.

## 8. Local (FFmpeg) rendering — always preferred

All of these are deterministic and free — done locally, never via AI: zoom, pan, Ken-Burns, motion-crop, transitions, subtitles, text/overlays, intro/outro, audio sync, merging, color adjustments. AI is used only when deterministic rendering cannot produce the needed result (i.e., genuinely new moving pixels on a HIGH scene).

## 9. Modularity

Every generative call goes through an adapter with a stable interface (`generate_image`, `generate_motion`) resolving the concrete model from the routing config. Swapping fal for Replicate / self-hosted ComfyUI later is a config/adapter change, not a pipeline rewrite.

## 10. Schema additions (migration 002)

- `prompt_cache (id, project_id, hash unique, kind, model, asset_id, prompt, created_at)`
- `assets` += `tags text[]`, `reusable boolean default true`, `phash text`, `embedding` (reserved)
- `scenes` += `importance text`, `importance_score numeric`, `new_asset_required bool`, `existing_asset_allowed bool`, `recommended_quality text`, `motion_type text`
- `settings (id, project_id, kind, value jsonb)` — holds `model_routing`, thresholds, etc.

## 11. Expected effect

Naive pipeline: generate + AI-animate all 6–8 scenes ≈ $4–8/video. This architecture: 1–2 HIGH scenes generated + AI-animated, MEDIUM reused/mid, LOW reused, all motion local ⇒ **~$0.40–1.20/video** (≥50–70% fewer fal calls), within the $1.55 cap, quality concentrated where viewers notice it (hero/character/reveal).
