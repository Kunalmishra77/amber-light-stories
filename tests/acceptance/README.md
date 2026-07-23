# Acceptance tests — real end-to-end v1.0 verification

These are **local, real-service** tests. They are NOT part of CI (CI has no
FFmpeg, no render worker, and no external provider/YouTube credentials). Each
self-skips when its credentials are absent, and every one cleans up after itself
(DB rows, bucket objects, and any uploaded YouTube video).

Run from the repo root.

## `render_failure_paths.py` — render worker failure semantics (no external creds)
Retry → backoff → DLQ, emergency-stop release, idempotent adoption, tenant
isolation. Pure DB + the render worker module.

```
PYTHONPATH=. .venv/Scripts/python.exe tests/acceptance/render_failure_paths.py
```

## `render-chain.test.ts` — generation → render → MP4-in-bucket → publish-can-find-it
Real OpenAI script generation, the real Python render worker (mock-mode MP4 —
real playable file, $0), upload to the private `assets` bucket tenant-scoped,
and the web publish path locating it. Needs `OPENAI_API_KEY` in `.env` and
FFmpeg on PATH.

```
node --experimental-strip-types --import ./tests/acceptance/live-hooks.mjs \
     ./tests/acceptance/render-chain.test.ts
```

## `full-acceptance.test.ts` — the full v1.0 loop, including a REAL YouTube upload
Everything above, PLUS connecting the authorized YouTube channel (real refresh
token), a REAL private upload, confirming exactly one published video, a real
analytics-ingest call, and idempotent re-publish. Uploads **private** and
**deletes** the test video immediately after verification. Needs `OPENAI_API_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` in `.env` and
FFmpeg on PATH.

```
node --experimental-strip-types --import ./tests/acceptance/live-hooks.mjs \
     ./tests/acceptance/full-acceptance.test.ts
```

Last verified: real upload succeeded (YouTube id captured, uploaded private,
confirmed on channel, then deleted), 11/11 assertions.
