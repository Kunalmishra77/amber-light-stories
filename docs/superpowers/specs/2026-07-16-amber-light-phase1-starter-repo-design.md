# Amber Light Stories — Phase 1 Starter Repo Design

**Date:** 2026-07-16
**Status:** Approved
**Source spec:** `E:\YouTube-Automation\START-HERE-Amber-Light-Stories.md` (decisions in §1 are locked and inherited here)

## Goal

Scaffold the complete Phase-1 MVP repo for the Amber Light Stories YouTube automation channel: one video generated daily at 03:00 ET, QA-gated, auto-published at 09:00 ET via YouTube Data API, with Gmail confirmation. Single channel, single owner.

## Locked decisions (inherited from START-HERE §1)

- **Primary AI:** OpenAI API (scripts, titles, reasoning). No Claude API.
- **Secondary AI:** Gemini Flash (research, SEO, tags, translation, analytics).
- **Voice:** ElevenLabs Pro; Kokoro/Piper stub for later overflow.
- **Data/state:** Supabase Pro (Postgres, Storage, Vault). **Queue:** Redis + Celery.
- **Media:** FFmpeg Ken-Burns stills (Budget tier), Whisper captions, Pillow thumbnails.
- **Publish:** YouTube Data API v3, `private` + `publishAt` 09:00 America/New_York.
- **Deploy target:** Hetzner VPS + Coolify (docker-compose). **Local dev:** Docker Desktop on Windows.

## Orchestration decision (this design)

**Approach A — Celery-chain driven.** Celery Beat schedules the daily pipeline as a Celery chain. Redis is the execution queue; the Supabase `jobs` table is an audit/visibility layer, not the scheduler. Retries use Celery retry with exponential backoff (max 3), then the job is marked `dead`. Rationale: least code, idiomatic Celery, retries/DLQ built in; Supabase remains source of truth for *state*, Redis for *execution*.

Rejected: DB-polling queue (more custom code, reinvents Celery), pg_cron + Edge Functions (cannot run FFmpeg; a worker is required regardless).

## Repo layout

```
E:\YouTube-Automation\amber-light\
├── .env.example        # placeholders only; real .env is git-ignored
├── .gitignore
├── docker-compose.yml  # api + worker + redis (Coolify-deployable)
├── pyproject.toml      # Python 3.12, pinned deps
├── db/schema.sql       # MVP schema (START-HERE §5)
├── app/                # FastAPI
│   ├── main.py         # health, QA endpoints, webhooks
│   ├── config.py       # env loader (pydantic-settings)
│   ├── supabase_client.py
│   └── routers/
├── worker/
│   ├── celery_app.py
│   ├── beat.py         # generate 03:00 ET, publish 09:00 ET
│   └── tasks/          # research, script, voice, images, assemble,
│                       # thumbnail, seo, qa, publish, notify, analytics
├── ai/
│   ├── llm/            # openai_adapter, gemini_adapter, router
│   ├── tts/            # elevenlabs_adapter, kokoro_adapter (stub)
│   └── prompts/        # versioned templates
├── apis/               # youtube.py, gmail.py, analytics.py, trends.py
├── media/              # render.py, fonts/, music/, templates/
└── scripts/            # get_refresh_token.py, seed.py, backup.sh
```

## Pipeline (daily)

**03:00 ET — generate chain:** `research → script(OpenAI) → voice(ElevenLabs) → images(stills) → assemble(FFmpeg Ken-Burns) → thumbnail(Pillow) → seo(Gemini) → qa_hold`.

Each task: updates `videos.status`, writes a `jobs` audit row, logs provider cost to `api_usage`, retries ×3 with backoff → `failed`/`dead` with `last_error` on exhaustion.

**09:00 ET — publish:** uploads QA-approved (`ready`) videos as `private` with `publishAt`; **idempotency key checked before upload — a video is never uploaded twice.** On success → `notify` sends Gmail confirmation with the live URL.

## QA gate

Videos halt at `status='qa'`. FastAPI endpoints:
- `GET /videos?status=qa` — list pending
- `POST /videos/{id}/approve` → `ready`
- `POST /videos/{id}/reject` → `failed` (with reason)

Only `ready` videos publish. Gate stays on until output is trusted (START-HERE §9).

## AI routing

`ai/llm/router.py` routes by task type: scripts/titles/reasoning → OpenAI (`OPENAI_SCRIPT_MODEL` / `OPENAI_CHEAP_MODEL`); high-volume cheap work (tags, SEO, research summaries) → Gemini Flash. Adapters read keys from env only; every call logs tokens/cost to `api_usage`.

## Ships working vs. stubs

**Fully working:** repo skeleton, compose stack, `/health`, Supabase client + `db/schema.sql`, `scripts/get_refresh_token.py`, OpenAI + Gemini adapters, script task, SEO task, YouTube upload + Gmail notify, QA endpoints, beat schedule.

**Functional pending user assets/keys:** voice (needs ElevenLabs key), images (Pillow placeholder stills until an image source is chosen), `media/music/` and `media/fonts/` empty.

**Explicit stubs:** Kokoro TTS adapter, trends.py (returns static topics until quota-cached trend source is wired), analytics task (schema-complete, wiring later per build order step 8).

## Security

- Live keys exist in `E:\YouTube-Automation\credentials-youtube-automation.txt` and are **compromised** (previously shared in chat). User must rotate OpenAI, Supabase (DB password + JWT/API keys), and Gemini keys before going live.
- `.env` contains `REPLACE_ME` placeholders; user pastes **rotated** keys only. Old credentials file untouched until user confirms rotation, then deleted.
- `.gitignore` committed first; it excludes `.env`, `credentials*.txt`, OAuth `token.json` / `client_secret*.json`, `storage/`.

## Testing & error handling

Smoke tests (pytest): config loads from env, LLM router picks correct provider per task type, idempotency check blocks a duplicate publish. External calls wrapped with typed errors + cost logging. Failed jobs visible in Supabase (`jobs.status='failed'`, `last_error`).

## Manual steps that remain the user's (after scaffold)

1. Rotate the 3 compromised keys → fill `.env`.
2. Google Cloud project + OAuth client + enable YouTube Data/Analytics + Gmail APIs (START-HERE §4).
3. Run `scripts/get_refresh_token.py` → paste refresh token into `.env`.
4. Run `db/schema.sql` in Supabase SQL editor; seed one `channels` row (`scripts/seed.py`).
5. `docker compose up` → verify `/health`.

## Definition of done (MVP, from START-HERE §8)

- Unattended: watchable video generated, auto-published 09:00 ET.
- Gmail confirmation with live URL.
- Failed steps retry; never a duplicate upload (idempotency key).
- All state visible in Supabase; costs in `api_usage`.
- QA approve/reject gate before publish.
