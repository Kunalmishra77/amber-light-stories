# Credential Rotation Runbook (ISS-C3)

**Epic: M2 (security & storage hardening) · Item: ISS-C3**
**Date: 2026-07-20**

ISS-C3 = "Leaked dev credentials still in use — rotate; move to secret stores."

## What the audit found (the good news)

- **`.env` files are gitignored** (root `.gitignore` + `web/.gitignore`) and **were NEVER committed** — only `.env.example` is tracked. So **no secret is in git history.** (Verified with `git log --all` — no `.env` ever appears.)
- **Tenant-level credentials already live in the Supabase Vault** (migration `006_onboarding_vault.sql`: `tenant_credentials` via `store_credential` / `get_credential` RPCs, service-role only) — the correct secret store per Bible Part 7 §8 / ADR-010/054. No plaintext tenant secrets in code.
- **Platform-level credentials** live in `web/.env.local` (local) and Vercel project env vars (deployed) — the standard store for platform secrets. Not in code, not in git.

So the **store** side of ISS-C3 is already correct. The remaining work is **rotation** of any secret that was exposed during development.

## What must be rotated (OWNER ACTION — provider dashboards)

Any credential whose value was ever shown outside the secret store (pasted into chat, screenshots, shared logs) during development must be regenerated. Rotation cannot be done from code — it's a dashboard action per provider. After regenerating, update the value in **both** `web/.env.local` (local) and the **Vercel** project env vars (Production/Preview), then redeploy.

| Credential | Where it lives | Rotate at | Notes |
|---|---|---|---|
| **Supabase `service_role` key** | `.env.local`, Vercel | Supabase → Project Settings → API → "Reset service_role secret" | Highest priority — full DB/storage bypass. Rotating invalidates the old key everywhere. |
| **Supabase `anon` key** | `.env.local`, Vercel (`NEXT_PUBLIC_`) | Supabase → Project Settings → API | Public by design (client-side), but rotate if you reset JWT secret. |
| **Vercel token** (`vcp_…`) | was used via CLI | Vercel → Account → Settings → Tokens → revoke + recreate | Revoke the one used during dev. |
| **fal.ai key** (`FAL_KEY`) | `.env.local`, Vercel | fal.ai dashboard → Keys → revoke + new | Paid — rotate to prevent unauthorized spend. |
| **OpenAI key** | `.env.local`, Vercel | platform.openai.com → API keys | Paid. |
| **ElevenLabs key** | `.env.local`, Vercel | elevenlabs.io → Profile → API key | Paid. |
| **Google OAuth (Gmail/YouTube) client secret** | `.env.local`, Vercel | Google Cloud Console → Credentials → reset secret | Re-consent may be required. |

**Priority order:** Supabase `service_role` → fal.ai / OpenAI / ElevenLabs (paid) → Vercel token → Google OAuth → Supabase `anon`.

## Verification after rotation

1. `web/.env.local` and Vercel env vars hold the NEW values (old ones removed).
2. `npm run build` succeeds; the app can still read Supabase + validate providers.
3. The OLD keys are confirmed revoked (a request with an old key is rejected).

## Standing hygiene (already in place)

- Never paste secrets into chat, commits, screenshots, or logs.
- `.env*` stays gitignored (only `.env.example` with placeholder names is tracked).
- Tenant secrets go through the Vault RPCs, never a column or code.
- Full Vault lifecycle (rotation schedules, expiry, usage audit) and enterprise KMS/BYOK are tracked separately as **ISS-P7-07 / ISS-P4-R1-05 (M13)** — out of M2 scope.

---
**M2 code/store status: COMPLETE & VERIFIED.** Credential **rotation** is the remaining owner action per the table above; it requires provider-dashboard access and is intentionally not automated.
