# Production Deployment & Launch

Two deployables share ONE Supabase project and ONE durable `jobs` table:

1. **Web app** — Next.js on Vercel (project `web`, root directory `web/`). The
   SaaS control plane: onboarding, Vault credential management, pipeline review/
   approval, publish orchestration, analytics dashboard, cron drain endpoints.
2. **Render worker** — `python -m pipeline.render_worker --loop` on any always-on
   host with **FFmpeg**. It cannot run on Vercel (serverless, no FFmpeg). It
   claims only `render.run` jobs; the web worker claims everything else.

## 1. Web app — Vercel

### Required environment variables (Production)

Platform/infrastructure secrets ONLY. **No tenant provider key ever goes here** —
those live per-tenant in the Supabase Vault (verified in code: every provider
key resolves through `getTenantCredential` → `get_credential` RPC).

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | set |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase (RLS bypass in trusted paths) | set |
| `CRON_SECRET` | Cron auth (Vercel Cron sends it as `Authorization: Bearer`) | set |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Platform Google client (Gmail sender + OAuth fallback) | set |
| `GOOGLE_REFRESH_TOKEN` | Platform Gmail sender | set |
| `PLATFORM_EMAIL` | Gmail sender address | set |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Dedicated **Web** OAuth client for tenant YouTube connect | **NOT set — see §3** |
| `OAUTH_STATE_SECRET` | OAuth CSRF state signing | not set (falls back to service-role key — works; a dedicated one is recommended) |
| `NEXT_PUBLIC_APP_URL` / `APP_URL` | Absolute origin | not set (falls back to the request Host header — works on Vercel) |

### Deploy

```
cd web
vercel --prod --yes
```

### Cron cadence — Hobby vs Pro

Vercel **Hobby** caps crons at once per day. `web/vercel.json` is therefore set
to daily schedules so the app deploys. Daily job-draining is too slow for
interactive publishing (an approved video would wait up to 24 h).

For responsive automation, choose one:

- **Upgrade to Vercel Pro**, then restore the frequent schedules in
  `web/vercel.json`:
  ```json
  { "path": "/api/cron/process-jobs",  "schedule": "*/10 * * * *" }
  { "path": "/api/cron/run-schedules", "schedule": "0 * * * *" }
  ```
- **Drive the drain externally** from the always-on render-worker host (no Vercel
  upgrade needed). The endpoints are secured by `CRON_SECRET`:
  ```bash
  # every 10 minutes
  curl -sS -H "Authorization: Bearer $CRON_SECRET" \
       https://<production-domain>/api/cron/process-jobs
  # hourly
  curl -sS -H "Authorization: Bearer $CRON_SECRET" \
       https://<production-domain>/api/cron/run-schedules
  ```

## 2. Render worker

### Host requirements
- Python 3.12 venv with the repo installed (`pip install -e ".[dev]"`).
- **FFmpeg on PATH.**
- The repo's root `.env` with the SAME Supabase project (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`) and `STORAGE_DIR` for scratch render output.
- Outbound HTTPS.

### Run
```
cd amber-light
.venv/Scripts/python -m pipeline.render_worker --loop --interval 10
```

Scale by starting more instances — the atomic `claim_jobs` RPC prevents
double-claim and tenant-fair concurrency applies. The worker mirrors the Node
engine's lease/retry/backoff/DLQ, raises an incident on a dead render, respects
the workspace + platform emergency stop, and loads each tenant's own provider
keys from the Vault per job. It uploads the final MP4 to the private `assets`
bucket tenant-scoped; the web publish path finds it there.

The worker does NOT render paid visuals unless the tenant has BOTH `fal` and
`elevenlabs` keys in the Vault; otherwise it produces a real, playable MP4 in
mock mode ($0). Either way the file is real and uploadable to YouTube.

## 3. Google OAuth for tenant YouTube connect — OWNER ACTION

The browser "Connect with Google" flow (`/api/oauth/youtube/start` →
`/api/oauth/youtube/callback`) needs a Google Cloud **Web application** OAuth
client whose **Authorized redirect URI** is:

```
https://<production-domain>/api/oauth/youtube/callback
```

The existing `GOOGLE_CLIENT_ID` is a **Desktop** client (created for
`scripts/get_refresh_token.py`) and does NOT accept web redirect URIs, so the
browser flow will fail with `redirect_uri_mismatch` until a Web client is created.

Steps (Google Cloud Console, owner):
1. APIs & Services → Credentials → Create OAuth client ID → **Web application**.
2. Add the redirect URI above (and the preview domain if used).
3. Ensure **YouTube Data API v3** and **YouTube Analytics API** are enabled.
4. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in Vercel
   Production, then redeploy.

Until then, tenant YouTube connect is blocked at Google's consent screen. (The
publish/upload code itself is verified — the acceptance test used a valid
refresh token directly.)

## 4. Backup / DR — OWNER ACTION

See `docs/BACKUP_DR_RUNBOOK.md`. Backup is verified working; PITR confirmation,
a backup schedule, an off-site copy, and a restore drill are owner actions.
