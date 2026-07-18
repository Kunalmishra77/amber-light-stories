# Amber Light Stories — Phase 1

Automated YouTube storytelling channel. One video per day: generated at 03:00 ET,
human-QA-gated, published at 09:00 ET, Gmail confirmation on schedule.

Specs: `docs/superpowers/specs/`. Source plan: `docs/superpowers/plans/`.

## Setup (once)

1. **Rotate compromised keys** (OpenAI, Supabase, Gemini) — see START-HERE §0.
2. `copy .env.example .env` and fill in the **rotated** keys.
3. Google Cloud: create project, enable YouTube Data v3 + YouTube Analytics + Gmail
   APIs, create OAuth Desktop client (START-HERE §4). Put client id/secret in `.env`.
4. `.venv\Scripts\python scripts\get_refresh_token.py` → paste token into `.env`.
5. Run `db/schema.sql` in the Supabase SQL editor.
6. `.venv\Scripts\python scripts\seed.py` → seeds the channel row.

## Run

    docker compose up --build

- API: http://localhost:8000/health
- QA queue: `GET /videos?status=qa`, then `POST /videos/{id}/approve` or `/reject`.

**Security note:** the QA API has no authentication in Phase 1 and is bound to
`127.0.0.1` (localhost) only. Do not expose port 8000 publicly without adding auth.

## Dev

    py -3.12 -m venv .venv
    .venv\Scripts\pip install -e ".[dev]"
    .venv\Scripts\python -m pytest

## Pipeline

research → script (OpenAI) → voice (ElevenLabs) → images (stills) →
assemble (FFmpeg Ken-Burns) → thumbnail → seo (Gemini) → **QA hold** →
publish (09:00 ET, private+publishAt, idempotent) → Gmail notify.

Costs land in `api_usage`; job audit in `jobs`; all state in `videos.status`.
